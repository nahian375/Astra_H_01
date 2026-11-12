/**
 * ASTRA Health - Dedicated Offline AI Web Worker
 * 
 * Runs local neural model downloads and inference inside an isolated background thread.
 * Guarantees zero UI lag on the main thread, handles WebGPU and WASM fallback,
 * provides real-time download and token streaming, and strictly separates
 * the Downloaded stage from the Initializing stage.
 */

import { 
  pipeline, 
  env, 
  TextStreamer, 
  InterruptableStoppingCriteria, 
  type TextGenerationPipeline 
} from '@huggingface/transformers';

import type { 
  WorkerInMessage, 
  WorkerOutMessage, 
  DeviceBackend, 
  HardwareCapabilities,
  DownloadProgress 
} from './types';
import { OfflineStorageManager } from './storage';

// 1. Initial Transformers.js environment setup
// CRITICAL: env.allowLocalModels MUST be true when local_files_only is true,
// otherwise Transformers.js throws: "Invalid configuration detected: local models are disabled (env.allowLocalModels=false) but you have requested to only use local models (local_files_only=true)"
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/';

// Resilient fetch wrapper prioritizing server proxy for sandboxed browser environments
const nativeWorkerFetch = typeof self !== 'undefined' && self.fetch ? self.fetch.bind(self) : fetch;
(env as any).fetch = async (urlOrRequest: any, init?: any) => {
  const urlStr = typeof urlOrRequest === 'string' 
    ? urlOrRequest 
    : urlOrRequest instanceof URL 
      ? urlOrRequest.href 
      : urlOrRequest?.url || '';

  if (!urlStr) {
    return nativeWorkerFetch(urlOrRequest, init);
  }

  const origin = typeof self !== 'undefined' && self.location ? self.location.origin : '';
  const isSameOrigin = origin ? urlStr.startsWith(origin) : false;

  // For remote HuggingFace / jsdelivr / external CDN requests: proxy via same-origin Express route
  if (
    urlStr.startsWith('https://huggingface.co/') || 
    urlStr.startsWith('https://cdn.jsdelivr.net/') || 
    urlStr.includes('hf.co')
  ) {
    const proxyUrl = `${origin}/api/model-proxy?url=${encodeURIComponent(urlStr)}`;
    try {
      const proxyRes = await nativeWorkerFetch(proxyUrl, {
        method: 'GET',
        signal: init?.signal,
      });
      if (proxyRes.ok) {
        console.info(`[OfflineWorker Diagnostic] [FETCH_PROXY_SUCCESS] URL: ${urlStr} -> Status: ${proxyRes.status}`);
        return proxyRes;
      }
      console.warn(`[OfflineWorker Diagnostic] [FETCH_PROXY_HTTP_FAIL] URL: ${urlStr} -> Status: ${proxyRes.status}`);
    } catch (pxErr: any) {
      console.warn(`[OfflineWorker Diagnostic] [FETCH_PROXY_ERR] URL: ${urlStr} -> ${pxErr?.name}: ${pxErr?.message}`);
    }
  }

  // Same-origin or local requests (e.g. /wasm/*)
  try {
    const target = isSameOrigin || urlStr.startsWith('/') 
      ? (urlStr.startsWith('/') ? `${origin}${urlStr}` : urlStr) 
      : urlStr;

    const res = await nativeWorkerFetch(target, {
      method: init?.method || 'GET',
      headers: init?.headers,
      signal: init?.signal,
    });
    console.info(`[OfflineWorker Diagnostic] [FETCH_SUCCESS] URL: ${target} -> Status: ${res.status}`);
    return res;
  } catch (err: any) {
    console.error(`[OfflineWorker Diagnostic] [FETCH_FAIL] URL: ${urlStr} -> ${err?.name}: ${err?.message}`);
    throw err;
  }
};

// Configure ONNX Runtime Web WASM options safely using same-origin WASM paths
const isCrossOriginIsolated = typeof self !== 'undefined' && Boolean((self as any).crossOriginIsolated);
if (env.backends?.onnx?.wasm) {
  const origin = typeof self !== 'undefined' && self.location ? self.location.origin : '';
  env.backends.onnx.wasm.wasmPaths = `${origin}/wasm/`;
  env.backends.onnx.wasm.numThreads = isCrossOriginIsolated 
    ? Math.min(2, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 2) : 1)
    : 1;
  env.backends.onnx.wasm.proxy = false;
}

// Worker state
let activePipeline: TextGenerationPipeline | null = null;
let currentModelId: string | null = null;
let currentBackend: DeviceBackend = 'wasm';
let activeStoppingCriteria: InterruptableStoppingCriteria | null = null;
let isGenerating = false;
let isInitializing = false;

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

/**
 * Safely inspects hardware capabilities inside worker.
 */
async function probeHardware(): Promise<HardwareCapabilities> {
  let webGpuSupported = false;
  let webGpuHasFp16 = false;
  let isSoftwareGpu = false;
  let adapterInfo: HardwareCapabilities['adapterInfo'] = undefined;

  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        webGpuSupported = true;
        webGpuHasFp16 = adapter.features?.has('shader-f16') || false;

        if (adapter.info) {
          adapterInfo = {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            description: adapter.info.description,
          };
          const desc = `${adapter.info.description || ''} ${adapter.info.vendor || ''} ${adapter.info.architecture || ''}`.toLowerCase();
          if (desc.includes('swiftshader') || desc.includes('llvmpipe') || desc.includes('software')) {
            isSoftwareGpu = true;
          }
        }
      }
    } catch (err) {
      console.warn('[OfflineWorker] WebGPU check caught error:', err);
      webGpuSupported = false;
    }
  }

  const wasmThreads = env.backends?.onnx?.wasm?.numThreads || 1;

  return {
    webGpuSupported,
    webGpuHasFp16,
    isSoftwareGpu,
    adapterInfo,
    crossOriginIsolated: isCrossOriginIsolated,
    wasmThreads,
  };
}

export interface DeviceSelectionResult {
  device: DeviceBackend;
  reason: string;
}

/**
 * Determines the safest, optimal backend for the target model.
 * Never selects 'cpu'; strictly chooses 'webgpu' or 'wasm'.
 */
async function resolveBackend(modelId: string, preference?: 'auto' | DeviceBackend): Promise<DeviceSelectionResult> {
  const hw = await probeHardware();

  // If user explicitly chose a preference and it's not 'auto'
  if (preference && preference !== 'auto') {
    if (preference === 'webgpu') {
      if (hw.webGpuSupported && !hw.isSoftwareGpu) {
        return { device: 'webgpu', reason: 'User explicitly requested WebGPU and hardware acceleration is available.' };
      }
      return { device: 'wasm', reason: 'User requested WebGPU, but hardware WebGPU is unsupported or software-emulated; selected WASM.' };
    }
    return { device: 'wasm', reason: 'User explicitly requested WASM for CPU-based browser inference.' };
  }

  // Auto resolution
  const isHeavyFp16 = modelId.toLowerCase().includes('qwen3-4b') || modelId.toLowerCase().includes('q4f16');
  if (isHeavyFp16) {
    if (hw.webGpuSupported && hw.webGpuHasFp16 && !hw.isSoftwareGpu) {
      return { device: 'webgpu', reason: 'Heavy FP16 model requiring WebGPU hardware acceleration with shader-f16.' };
    }
    throw new Error(
      `Model ${modelId} requires WebGPU hardware acceleration with shader-f16 support. Current browser hardware does not support WebGPU f16.`
    );
  }

  // For compact models: prefer WebGPU only if real hardware GPU is present, otherwise wasm
  if (hw.webGpuSupported && !hw.isSoftwareGpu) {
    return { device: 'webgpu', reason: 'Auto-detected hardware WebGPU acceleration support.' };
  }

  return { device: 'wasm', reason: 'WebGPU unavailable or software-emulated; selected WASM for CPU-based browser inference.' };
}

/**
 * STAGE 1: Standalone Download.
 * Downloads model assets directly to CacheStorage WITHOUT creating an ONNX session.
 * Stops cleanly at 'DOWNLOADED' state.
 */
async function handleDownload(modelId: string) {
  const startTime = performance.now();
  try {
    post({ type: 'STATUS_CHANGE', status: 'DOWNLOADING', detail: `Downloading assets for ${modelId}...` });

    const result = await OfflineStorageManager.downloadModelAssetsToCache(modelId, (progress: DownloadProgress) => {
      post({ type: 'DOWNLOAD_PROGRESS', progress });
    });

    const durationMs = Math.round(performance.now() - startTime);

    post({
      type: 'DOWNLOAD_COMPLETE',
      modelId,
      totalBytes: result.totalBytes,
      fileCount: result.fileCount,
      durationMs,
    });

    post({
      type: 'STATUS_CHANGE',
      status: 'DOWNLOADED',
      detail: `Model downloaded in browser storage (${result.fileCount} files, ${(result.totalBytes / (1024 * 1024)).toFixed(1)} MB). Ready to initialize.`,
      elapsedMs: durationMs,
    });

  } catch (err: any) {
    console.error('[OfflineWorker] Download failed:', err);
    post({
      type: 'ERROR',
      code: 'DOWNLOAD_FAILED',
      message: err?.message || 'Download failed',
      fatal: false,
      stage: 'downloading',
    });
    post({
      type: 'STATUS_CHANGE',
      status: 'ERROR',
      detail: `Download failed: ${err.message}`,
    });
  }
}

/**
 * STAGE 2: Explicit Initialization.
 * Loads the downloaded model from CacheStorage into an active ONNX InferenceSession.
 * Only called on explicit user action.
 */
async function handleInitialize(modelId: string, devicePref: 'auto' | DeviceBackend = 'auto') {
  if (isInitializing) {
    console.warn('[OfflineWorker] Initialization already in progress');
    return;
  }

  isInitializing = true;
  const startTime = performance.now();

  try {
    post({ type: 'STATUS_CHANGE', status: 'INITIALIZING', detail: `Selecting runtime device for ${modelId}...` });

    const selection = await resolveBackend(modelId, devicePref);
    let targetDevice: DeviceBackend = selection.device;
    currentBackend = targetDevice;

    console.info(`[OfflineWorker] Selected device: "${targetDevice}" | Selection rationale: ${selection.reason}`);

    post({ 
      type: 'STATUS_CHANGE', 
      status: 'INITIALIZING', 
      detail: `Allocating neural session on ${targetDevice.toUpperCase()} backend (${selection.reason})...` 
    });

    // Enforce runtime configuration BEFORE pipeline creation:
    // allowLocalModels MUST be true to load from CacheStorage
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = true;
    env.remoteHost = 'https://huggingface.co';
    env.remotePathTemplate = '{model}/resolve/{revision}/';

    // Verify required assets exist in local CacheStorage before loading
    const verification = await OfflineStorageManager.verifyModelAssetsPresent(modelId);
    console.info(`[OfflineWorker] Local storage verification for "${modelId}":`, {
      allPresent: verification.allPresent,
      verifiedCount: verification.verifiedUrls.length,
      missingFiles: verification.missingFiles,
      cachedMB: (verification.cachedBytes / (1024 * 1024)).toFixed(1),
    });

    if (!verification.allPresent) {
      throw new Error(
        `Required model assets missing from local cache: ${verification.missingFiles.join(', ')}. Please download the model first before initializing.`
      );
    }

    const loadPipelineSession = async (dev: DeviceBackend) => {
      // Device MUST ONLY be 'webgpu' or 'wasm'. NEVER 'cpu'.
      const pipeOptions: any = {
        device: dev,
        dtype: 'q4',
        // Force loading strictly from local CacheStorage; disallow outbound remote calls
        local_files_only: true,
        session_options: {
          executionMode: 'sequential',
          extra: {
            session: {
              disable_preallocating_initializers: '1',
            },
          },
        },
      };

      console.info('[OfflineWorker] Model initialization options:', {
        modelId,
        device: dev,
        dtype: pipeOptions.dtype,
        local_files_only: pipeOptions.local_files_only,
        'env.allowLocalModels': env.allowLocalModels,
        'env.allowRemoteModels': env.allowRemoteModels,
      });

      return await pipeline('text-generation', modelId, pipeOptions);
    };

    let pipe: TextGenerationPipeline;
    try {
      pipe = await loadPipelineSession(targetDevice);
    } catch (primaryErr: any) {
      // Safely dispose of failed or partially initialized resources
      activePipeline = null;
      currentModelId = null;

      const primaryMsg = primaryErr?.message || String(primaryErr);

      // If primary WebGPU attempt failed and user did not explicitly lock to 'webgpu', fall back to 'wasm'
      if (targetDevice === 'webgpu' && devicePref !== 'webgpu') {
        console.warn(`[OfflineWorker] WebGPU initialization failed: "${primaryMsg}". Resources disposed. Falling back to WASM...`);
        post({
          type: 'STATUS_CHANGE',
          status: 'INITIALIZING',
          detail: `WebGPU init failed (${primaryMsg}); falling back to WASM backend...`,
        });
        targetDevice = 'wasm';
        currentBackend = 'wasm';
        pipe = await loadPipelineSession('wasm');
      } else {
        throw primaryErr;
      }
    }

    activePipeline = pipe;
    currentModelId = modelId;

    const durationMs = Math.round(performance.now() - startTime);

    post({
      type: 'MODEL_READY',
      modelId,
      backend: targetDevice,
      durationMs,
    });

    post({
      type: 'STATUS_CHANGE',
      status: 'READY',
      detail: `Neural engine initialized on ${targetDevice.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s)`,
      elapsedMs: durationMs,
    });

  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    console.error('[OfflineWorker] Model initialization error:', err);

    // Ensure completely cleaned state on error
    activePipeline = null;
    currentModelId = null;

    post({
      type: 'ERROR',
      code: 'INIT_FAILED',
      message: rawMsg,
      fatal: false,
      stage: 'initializing',
    });

    post({
      type: 'STATUS_CHANGE',
      status: 'ERROR',
      detail: `Initialization failed: ${rawMsg}`,
    });
  } finally {
    isInitializing = false;
  }
}

/**
 * STAGE 3: Inference Execution.
 */
async function handleGenerate(
  id: string, 
  prompt: string, 
  systemPrompt?: string, 
  config?: any
) {
  if (!activePipeline) {
    post({ 
      type: 'ERROR', 
      code: 'NO_MODEL', 
      message: 'No model loaded in memory session. Click Initialize Model first.', 
      fatal: false,
      stage: 'generating',
    });
    return;
  }

  if (isGenerating) {
    console.warn('[OfflineWorker] Concurrent generation rejected');
    return;
  }

  isGenerating = true;
  post({ type: 'STATUS_CHANGE', status: 'GENERATING', detail: 'Synthesizing response...' });

  const stoppingCriteria = new InterruptableStoppingCriteria();
  activeStoppingCriteria = stoppingCriteria;

  const maxNewTokens = Math.min(180, config?.maxNewTokens || 128);
  const temperature = config?.temperature ?? 0.35;
  const doSample = temperature > 0;

  // Format messages
  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  let fullGeneratedText = '';
  let tokenCount = 0;
  const startTime = performance.now();

  const streamer = new TextStreamer(activePipeline.tokenizer, {
    skip_prompt: true,
    callback_function: (chunk: string) => {
      if (!isGenerating) return;
      tokenCount++;
      fullGeneratedText += chunk;
      post({ type: 'STREAM_TOKEN', id, token: chunk });
    },
  });

  try {
    const output = await activePipeline(messages, {
      max_new_tokens: maxNewTokens,
      temperature,
      do_sample: doSample,
      streamer,
      stopping_criteria: [stoppingCriteria],
      return_full_text: false,
    });

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    const tokensPerSec = durationMs > 0 ? Number(((tokenCount / durationMs) * 1000).toFixed(1)) : 0;

    let finalText = fullGeneratedText.trim();
    if (!finalText && output && Array.isArray(output) && output[0]?.generated_text) {
      const genText = output[0].generated_text;
      if (Array.isArray(genText)) {
        const lastMsg = genText[genText.length - 1];
        const content = lastMsg?.content;
        finalText = typeof content === 'string' ? content : JSON.stringify(content || '');
      } else if (typeof genText === 'string') {
        finalText = genText;
      }
    }

    post({
      type: 'GENERATION_COMPLETE',
      payload: {
        id,
        text: finalText,
        modelId: currentModelId || 'unknown',
        isNeural: true,
        metrics: {
          totalTokens: tokenCount,
          durationMs,
          tokensPerSec,
          backendUsed: currentBackend,
          modelId: currentModelId || 'unknown',
        },
      },
    });

    post({ 
      type: 'STATUS_CHANGE', 
      status: 'READY', 
      detail: `Inference complete (${tokenCount} tokens in ${(durationMs / 1000).toFixed(1)}s)`,
      elapsedMs: durationMs,
    });

  } catch (err: any) {
    if (stoppingCriteria.interrupted) {
      post({ type: 'GENERATION_ABORTED', id });
      post({ type: 'STATUS_CHANGE', status: 'READY', detail: 'Inference cancelled by user' });
    } else {
      console.error('[OfflineWorker] Inference failure:', err);
      post({ 
        type: 'ERROR', 
        code: 'INFERENCE_FAILED', 
        message: err?.message || 'Neural inference failed', 
        fatal: false,
        stage: 'generating',
      });
      post({ type: 'STATUS_CHANGE', status: 'READY', detail: 'Inference error occurred' });
    }
  } finally {
    isGenerating = false;
    activeStoppingCriteria = null;
  }
}

// Handle incoming messages from the main thread
self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'PROBE_HARDWARE': {
      const hw = await probeHardware();
      post({ type: 'HARDWARE_REPORT', payload: hw });
      break;
    }

    case 'DOWNLOAD_MODEL': {
      await handleDownload(msg.modelId);
      break;
    }

    case 'INITIALIZE_MODEL': {
      await handleInitialize(msg.modelId, msg.devicePreference);
      break;
    }

    case 'GENERATE': {
      await handleGenerate(msg.id, msg.prompt, msg.systemPrompt, msg.config);
      break;
    }

    case 'ABORT_GENERATION': {
      if (activeStoppingCriteria) {
        activeStoppingCriteria.interrupt();
      }
      isGenerating = false;
      break;
    }

    case 'UNLOAD_MODEL': {
      activePipeline = null;
      currentModelId = null;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      post({ type: 'STATUS_CHANGE', status: 'DOWNLOADED', detail: 'Model session released. Assets remain on disk.' });
      break;
    }

    case 'PURGE_CACHE': {
      activePipeline = null;
      currentModelId = null;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      await OfflineStorageManager.purgeModelCache(msg.modelId);
      post({ type: 'STATUS_CHANGE', status: 'IDLE', detail: 'Model cache purged.' });
      break;
    }
  }
};
