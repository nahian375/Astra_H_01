/**
 * ASTRA Health - Dedicated Offline AI Web Worker
 * Runs local neural model inference in a background thread using Transformers.js.
 * Guarantees zero UI stutter, authentic on-device processing, WebGPU-first with WASM fallback,
 * and token streaming to the main thread.
 */

import { 
  pipeline, 
  env, 
  TextStreamer, 
  InterruptableStoppingCriteria, 
  type TextGenerationPipeline 
} from '@huggingface/transformers';
import type { 
  WorkerIncomingMessage, 
  WorkerOutgoingMessage, 
  InferenceDevice, 
  ModelProgressEvent 
} from '../types/ai';

// 1. Configure Transformers.js offline, remote CDN, and storage behavior
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/';

// Configure ONNX Runtime Web WASM options for Web Worker environments
const isCrossOriginIsolated = typeof self !== 'undefined' && Boolean((self as any).crossOriginIsolated);

if (env.backends?.onnx?.wasm) {
  const origin = typeof self !== 'undefined' && self.location ? self.location.origin : '';
  env.backends.onnx.wasm.wasmPaths = `${origin}/wasm/`;
  // Limit WASM threads to 1 unless crossOriginIsolated (SharedArrayBuffer) is true to prevent std::bad_alloc
  env.backends.onnx.wasm.numThreads = isCrossOriginIsolated 
    ? Math.min(2, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 2) : 1)
    : 1;
  env.backends.onnx.wasm.proxy = false;
}

// Default compact model: ~114 MB INT4 quantized ONNX artifact from public unauthenticated HF repo
const DEFAULT_MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX';

// Singleton state inside worker thread
let activePipeline: TextGenerationPipeline | null = null;
let loadedModelId: string | null = null;
let activeDevice: InferenceDevice = 'wasm';
let isInitializing = false;
let activeGenerationId: string | null = null;
let isAborted = false;
let currentStoppingCriteria: InterruptableStoppingCriteria | null = null;

function post(msg: WorkerOutgoingMessage) {
  self.postMessage(msg);
}

/**
 * Checks if WebGPU is genuinely accessible and hardware-accelerated.
 * Software WebGPU adapters (SwiftShader/LLVMpipe) trigger GPU process crashes in containerized previews.
 */
async function canUseWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) return false;

      // Check for software WebGPU emulation (SwiftShader / LLVMpipe)
      if (typeof (adapter as any).requestAdapterInfo === 'function') {
        const info = await (adapter as any).requestAdapterInfo();
        if (info) {
          const vendor = (info.vendor || '').toLowerCase();
          const arch = (info.architecture || '').toLowerCase();
          const desc = (info.description || '').toLowerCase();
          if (vendor.includes('swiftshader') || arch.includes('swiftshader') || desc.includes('llvmpipe') || desc.includes('softpipe')) {
            console.info('[ASTRA Diagnostic] Software WebGPU detected (SwiftShader/LLVMpipe). Defaulting to CPU WebAssembly engine for stability.');
            return false;
          }
        }
      }
      return true;
    }
  } catch {
    // WebGPU query failed or not permitted
  }
  return false;
}

/**
 * Loads or returns the cached model pipeline with WebGPU-first and WASM fallback.
 */
async function getOrInitPipeline(modelId = DEFAULT_MODEL_ID, forceWasm = false): Promise<TextGenerationPipeline> {
  if (activePipeline && loadedModelId === modelId && (!forceWasm || activeDevice === 'wasm')) {
    return activePipeline;
  }

  if (isInitializing) {
    throw new Error('Model initialization is already in progress');
  }

  isInitializing = true;
  post({
    type: 'STATUS_UPDATE',
    status: 'DOWNLOADING',
    progress: 0,
    detail: 'Initializing local model runtime...',
  });

  const progressCallback = (info: any) => {
    if (!info) return;
    const progressEvent: ModelProgressEvent = {
      status: info.status || 'progress',
      file: info.file,
      progress: typeof info.progress === 'number' ? Math.round(info.progress) : undefined,
      loaded: info.loaded,
      total: info.total,
      device: activeDevice,
      detail: info.file 
        ? `Fetching ${info.file}${typeof info.progress === 'number' ? ` (${Math.round(info.progress)}%)` : ''}`
        : 'Loading model weights...',
    };
    post({ type: 'PROGRESS', data: progressEvent });
  };

  // Step A: Attempt WebGPU unless caller forced WASM
  let initialized = false;
  if (!forceWasm) {
    const webGpuSupported = await canUseWebGPU();
    if (webGpuSupported) {
      try {
        post({
          type: 'STATUS_UPDATE',
          status: 'DOWNLOADING',
          progress: 5,
          detail: 'Attempting WebGPU high-performance device allocation...',
          device: 'webgpu',
        });

        const pipe = (await pipeline('text-generation', modelId, {
          device: 'webgpu',
          dtype: 'q4',
          progress_callback: progressCallback,
        })) as unknown as TextGenerationPipeline;

        activePipeline = pipe;
        loadedModelId = modelId;
        activeDevice = 'webgpu';
        initialized = true;

        console.info(`[ASTRA Diagnostic] Model initialized successfully | Repo: ${modelId} | Backend: WEBGPU`);

        post({
          type: 'STATUS_UPDATE',
          status: 'READY',
          progress: 100,
          detail: 'SmolLM2-135M active on WebGPU hardware acceleration',
          device: 'webgpu',
        });
      } catch (gpuError: any) {
        console.warn('[ASTRA Diagnostic] WebGPU allocation failed, falling back to CPU WebAssembly:', gpuError?.message || gpuError);
        post({
          type: 'STATUS_UPDATE',
          status: 'DOWNLOADING',
          detail: 'WebGPU allocation failed. Falling back to CPU WebAssembly engine...',
          device: 'wasm',
        });
      }
    }
  }

  // Step B: WASM Fallback (Universal CPU WebAssembly execution)
  if (!initialized) {
    try {
      post({
        type: 'STATUS_UPDATE',
        status: 'DOWNLOADING',
        progress: 10,
        detail: 'Initializing WebAssembly CPU runtime...',
        device: 'wasm',
      });

      const pipe = (await pipeline('text-generation', modelId, {
        device: 'wasm',
        dtype: 'q4',
        progress_callback: progressCallback,
      })) as unknown as TextGenerationPipeline;

      activePipeline = pipe;
      loadedModelId = modelId;
      activeDevice = 'wasm';
      initialized = true;

      console.info(`[ASTRA Diagnostic] Model initialized successfully | Repo: ${modelId} | Backend: WASM`);

      post({
        type: 'STATUS_UPDATE',
        status: 'READY',
        progress: 100,
        detail: 'SmolLM2-135M active on CPU WebAssembly runtime',
        device: 'wasm',
      });
    } catch (wasmError: any) {
      isInitializing = false;
      const errMsg = `Local model initialization failed on all backends: ${wasmError?.message || wasmError}`;
      console.error('[ASTRA Local Worker] Fatal loading failure:', wasmError);
      post({
        type: 'ERROR',
        error: errMsg,
      });
      post({
        type: 'STATUS_UPDATE',
        status: 'ERROR',
        detail: errMsg,
      });
      throw new Error(errMsg);
    }
  }

  isInitializing = false;
  return activePipeline!;
}

/**
 * Checks whether model weights are genuinely cached in the browser's CacheStorage.
 * Verifies that both the tokenizer/config and the actual .onnx weights exist.
 */
async function checkCache(modelId = DEFAULT_MODEL_ID) {
  try {
    if (typeof self !== 'undefined' && 'caches' in self && self.caches) {
      const cacheNames = await self.caches.keys();
      const hasTransformersCache = cacheNames.includes('transformers-cache');
      if (hasTransformersCache) {
        const cache = await self.caches.open('transformers-cache');
        const requests = await cache.keys();
        const normalizedTarget = modelId.toLowerCase().replace('/', '_');
        const matchingUrls = requests
          .map(r => r.url.toLowerCase())
          .filter(url => url.includes(normalizedTarget) || url.includes('smollm2-135m'));

        // Establish that both model weights (.onnx) AND tokenizer files are present
        const hasWeights = matchingUrls.some(url => url.includes('.onnx'));
        const hasTokenizer = matchingUrls.some(url => url.includes('tokenizer.json') || url.includes('tokenizer_config.json'));
        const isFullyCached = hasWeights && hasTokenizer;

        post({ type: 'CACHE_STATUS', hasCachedModel: isFullyCached, modelId });
        return;
      }
    }
    post({ type: 'CACHE_STATUS', hasCachedModel: false, modelId });
  } catch (err: any) {
    console.warn('[ASTRA Local Worker] Cache check warning:', err?.message || err);
    post({ type: 'CACHE_STATUS', hasCachedModel: false, modelId });
  }
}

/**
 * Unloads the active model pipeline from worker memory without purging CacheStorage.
 */
async function unloadModel() {
  activePipeline = null;
  loadedModelId = null;
  post({
    type: 'STATUS_UPDATE',
    status: 'NOT_INSTALLED',
    progress: 0,
    detail: 'In-memory pipeline unloaded. Model weights remain cached in browser storage.',
  });
  await checkCache(DEFAULT_MODEL_ID);
}

/**
 * Purges the browser's Transformers.js CacheStorage.
 */
async function clearCache() {
  try {
    if (typeof self !== 'undefined' && 'caches' in self && self.caches) {
      await self.caches.delete('transformers-cache');
    }
    activePipeline = null;
    loadedModelId = null;
    post({
      type: 'STATUS_UPDATE',
      status: 'NOT_INSTALLED',
      progress: 0,
      detail: 'Local model cache cleared',
    });
    post({ type: 'CACHE_STATUS', hasCachedModel: false, modelId: DEFAULT_MODEL_ID });
  } catch (err: any) {
    post({ type: 'ERROR', error: `Failed to clear cache: ${err?.message || err}` });
  }
}

/**
 * Generates tokens using the active pipeline, streaming chunks live via TextStreamer
 * and supporting genuine loop interruption via InterruptableStoppingCriteria.
 */
async function generate(id: string, prompt: string, maxNewTokens = 350, temperature = 0.6) {
  activeGenerationId = id;
  isAborted = false;
  currentStoppingCriteria = new InterruptableStoppingCriteria();
  const startTime = performance.now();
  let firstTokenTime: number | null = null;

  console.info(`[ASTRA Diagnostic] Generation started | Request ID: ${id} | Backend: ${activeDevice.toUpperCase()} | MaxTokens: ${maxNewTokens}`);

  let pipe: TextGenerationPipeline;
  try {
    pipe = await getOrInitPipeline();
  } catch (initErr: any) {
    console.error(`[ASTRA Diagnostic] Pipeline initialization failed | Request ID: ${id} | Error:`, initErr?.message || initErr);
    post({ type: 'ERROR', id, error: `Pipeline initialization error: ${initErr?.message || initErr}` });
    return;
  }

  post({
    type: 'STATUS_UPDATE',
    status: 'GENERATING',
    detail: `Inference running on ${activeDevice.toUpperCase()}`,
    device: activeDevice,
  });

  let fullGeneratedText = '';
  let tokensCount = 0;

  // Use native TextStreamer for token-by-token streaming back to main thread
  const streamer = new TextStreamer(pipe.tokenizer as any, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk: string) => {
      // Discard stale chunks from prior or aborted runs
      if (isAborted || activeGenerationId !== id) {
        return;
      }
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
        console.info(`[ASTRA Diagnostic] First token received | Request ID: ${id} | TTFT: ${Math.round(firstTokenTime - startTime)}ms`);
      }
      tokensCount++;
      fullGeneratedText += chunk;
      post({
        type: 'TOKEN_CHUNK',
        id,
        chunk,
      });
    },
  });

  try {
    // Execute generation pipeline with stopping_criteria for true cancellation
    const output = (await pipe(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: Math.max(0.1, temperature),
      do_sample: temperature > 0.1,
      top_p: 0.9,
      repetition_penalty: 1.15,
      streamer,
      stopping_criteria: currentStoppingCriteria,
    })) as any;

    const durationMs = Math.round(performance.now() - startTime);

    if (isAborted || activeGenerationId !== id) {
      console.info(`[ASTRA Diagnostic] Generation cancelled by astronaut | Request ID: ${id}`);
      post({ type: 'GENERATION_ABORTED', id });
      post({
        type: 'STATUS_UPDATE',
        status: 'READY',
        detail: 'Generation cancelled by astronaut',
        device: activeDevice,
      });
      return;
    }

    // Extract raw text if streamer was suppressed or completed
    let text = fullGeneratedText;
    if (!text && Array.isArray(output) && output[0]?.generated_text) {
      text = output[0].generated_text;
      if (text.startsWith(prompt)) {
        text = text.slice(prompt.length).trim();
      }
    }

    console.info(`[ASTRA Diagnostic] Generation complete | Request ID: ${id} | Tokens: ${tokensCount} | Duration: ${durationMs}ms | Device: ${activeDevice.toUpperCase()}`);

    post({
      type: 'GENERATION_COMPLETE',
      id,
      fullText: text.trim(),
      tokensGenerated: tokensCount,
      durationMs,
      device: activeDevice,
    });

    post({
      type: 'STATUS_UPDATE',
      status: 'READY',
      detail: `Generated in ${durationMs}ms on ${activeDevice.toUpperCase()}`,
      device: activeDevice,
    });
  } catch (err: any) {
    if (isAborted || activeGenerationId !== id) {
      post({ type: 'GENERATION_ABORTED', id });
      return;
    }

    // Check 3: If WebGPU failed during active generation, fall back to multithreaded WASM and retry
    if (activeDevice === 'webgpu') {
      console.warn('[ASTRA Local Worker] WebGPU runtime error during generation. Attempting WASM fallback recovery...', err);
      post({
        type: 'STATUS_UPDATE',
        status: 'DOWNLOADING',
        detail: 'WebGPU runtime error. Falling back to multithreaded WASM engine...',
        device: 'wasm',
      });

      try {
        activePipeline = null;
        loadedModelId = null;
        const wasmPipe = await getOrInitPipeline(DEFAULT_MODEL_ID, true);

        const wasmOutput = (await wasmPipe(prompt, {
          max_new_tokens: maxNewTokens,
          temperature: Math.max(0.1, temperature),
          do_sample: temperature > 0.1,
          top_p: 0.9,
          repetition_penalty: 1.15,
          streamer,
          stopping_criteria: currentStoppingCriteria,
        })) as any;

        const durationMs = Math.round(performance.now() - startTime);
        let wasmText = fullGeneratedText;
        if (!wasmText && Array.isArray(wasmOutput) && wasmOutput[0]?.generated_text) {
          wasmText = wasmOutput[0].generated_text;
          if (wasmText.startsWith(prompt)) {
            wasmText = wasmText.slice(prompt.length).trim();
          }
        }

        post({
          type: 'GENERATION_COMPLETE',
          id,
          fullText: wasmText.trim(),
          tokensGenerated: tokensCount,
          durationMs,
          device: 'wasm',
        });

        post({
          type: 'STATUS_UPDATE',
          status: 'READY',
          detail: `Recovered on WASM in ${durationMs}ms`,
          device: 'wasm',
        });
        return;
      } catch (wasmRetryErr: any) {
        console.error('[ASTRA Local Worker] WASM fallback generation also failed:', wasmRetryErr);
        post({ type: 'ERROR', id, error: `Inference failed on both WebGPU and WASM: ${wasmRetryErr?.message || wasmRetryErr}` });
      }
    } else {
      console.error('[ASTRA Local Worker] Inference error:', err);
      post({ type: 'ERROR', id, error: err?.message || 'Local neural inference failed' });
    }

    post({
      type: 'STATUS_UPDATE',
      status: activePipeline ? 'READY' : 'ERROR',
      device: activeDevice,
    });
  } finally {
    if (activeGenerationId === id) {
      activeGenerationId = null;
    }
  }
}

// Worker message listener
self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'INIT_MODEL':
      try {
        await getOrInitPipeline(msg.modelId, msg.forceWasm);
      } catch {
        // Error already posted inside getOrInitPipeline
      }
      break;

    case 'GENERATE':
      // Handle concurrent request safely: interrupt prior run if active
      if (activeGenerationId && activeGenerationId !== msg.id) {
        isAborted = true;
        currentStoppingCriteria?.interrupt();
        post({ type: 'GENERATION_ABORTED', id: activeGenerationId });
      }
      await generate(msg.id, msg.prompt, msg.maxNewTokens, msg.temperature);
      break;

    case 'ABORT_GENERATION':
      if (activeGenerationId === msg.id || !msg.id) {
        isAborted = true;
        currentStoppingCriteria?.interrupt();
        post({ type: 'GENERATION_ABORTED', id: msg.id || activeGenerationId || '' });
      }
      break;

    case 'CHECK_CACHE':
      await checkCache(msg.modelId);
      break;

    case 'UNLOAD_MODEL':
      await unloadModel();
      break;

    case 'CLEAR_CACHE':
      await clearCache();
      break;

    default:
      console.warn('[ASTRA Local Worker] Unknown message type received:', (msg as any).type);
  }
};

