/**
 * ASTRA Health - Local AI Model Manager
 * Coordinates background Web Worker lifecycle, real download progress,
 * storage persistence verification, WebGPU/WASM device checks, and model cache state.
 */

import { 
  LocalModelStatus, 
  InferenceDevice, 
  WorkerIncomingMessage, 
  WorkerOutgoingMessage 
} from '../types/ai';

export type CacheState = 'cached' | 'not_cached' | 'partially_cached' | 'unknown';

export interface ModelInfo {
  name: string;
  architecture: string;
  parameters: string;
  estimatedVRAM_MB: number;
  status: LocalModelStatus;
  downloadProgress: number; // 0 - 100
  webGpuAvailable: boolean;
  activeDevice?: InferenceDevice;
  cacheState?: CacheState;
  bytesLoaded?: number;
  bytesTotal?: number;
  currentFile?: string;
  detail?: string;
  errorMessage?: string;
}

export const DEFAULT_MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX';

class LocalAIManager {
  private status: LocalModelStatus = 'NOT_INSTALLED';
  private downloadProgress = 0;
  private hasWebGPU = false;
  private activeDevice: InferenceDevice = 'wasm';
  private cacheState: CacheState = 'unknown';
  private bytesLoaded?: number;
  private bytesTotal?: number;
  private currentFile?: string;
  private detail?: string;
  private errorMessage?: string;

  private worker: Worker | null = null;
  private isWorkerInitializing = false;
  private listeners: ((info: ModelInfo) => void)[] = [];

  // Active generation promises & token callbacks
  private activeTokenCallback: ((id: string, chunk: string) => void) | null = null;
  private activeCompleteResolver: ((msg: any) => void) | null = null;
  private activeRejecter: ((err: Error) => void) | null = null;
  private activeAbortResolver: ((id: string) => void) | null = null;

  constructor() {
    // Phase 1 Protection: Do NOT eagerly request GPU adapter or initialize workers on module load.
    // Hardware and cache checks should only happen on explicit user action.
  }

  /**
   * Initializes hardware capability query and inspects existing CacheStorage.
   */
  private async initHardwareAndCache() {
    await this.checkWebGpuSupport();
    if (typeof window !== 'undefined') {
      this.checkCache();
    }
  }

  public async checkWebGpuSupport(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        this.hasWebGPU = !!adapter;
        if (this.hasWebGPU) {
          this.activeDevice = 'webgpu';
        }
      } catch (e) {
        this.hasWebGPU = false;
      }
    } else {
      this.hasWebGPU = false;
    }
    this.notify();
    return this.hasWebGPU;
  }

  /**
   * Safe storage usage & quota estimation via StorageManager API.
   */
  public async getStorageEstimate(): Promise<{ usageMB?: number; quotaMB?: number } | null> {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return {
          usageMB: est.usage ? Math.round(est.usage / (1024 * 1024)) : undefined,
          quotaMB: est.quota ? Math.round(est.quota / (1024 * 1024)) : undefined,
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Lazily instantiates and reuses the singleton Web Worker.
   */
  private getWorker(): Worker | null {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return null;
    }

    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./localWorker.ts', import.meta.url), { type: 'module' });
        this.setupWorkerListeners(this.worker);
      } catch (err: any) {
        console.warn('[ASTRA LocalAIManager] Could not instantiate Web Worker:', err?.message || err);
        this.status = 'UNSUPPORTED';
        this.errorMessage = err?.message || 'Worker initialization failed';
        this.notify();
        return null;
      }
    }

    return this.worker;
  }

  /**
   * Dispatches typed message to worker.
   */
  private postToWorker(msg: WorkerIncomingMessage): boolean {
    const w = this.getWorker();
    if (!w) return false;
    w.postMessage(msg);
    return true;
  }

  /**
   * Subscribes to events from the dedicated worker thread.
   */
  private setupWorkerListeners(worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'STATUS_UPDATE':
          this.status = msg.status;
          if (typeof msg.progress === 'number') {
            this.downloadProgress = msg.progress;
          }
          if (msg.device) {
            this.activeDevice = msg.device;
          }
          if (msg.detail) {
            this.detail = msg.detail;
          }
          if (msg.status === 'READY') {
            this.cacheState = 'cached';
            this.errorMessage = undefined;
          } else if (msg.status === 'ERROR') {
            this.errorMessage = msg.detail || 'Model error';
          }
          this.notify();
          break;

        case 'PROGRESS':
          if (msg.data) {
            if (typeof msg.data.progress === 'number') {
              this.downloadProgress = msg.data.progress;
            }
            this.bytesLoaded = msg.data.loaded;
            this.bytesTotal = msg.data.total;
            this.currentFile = msg.data.file;
            if (msg.data.device) {
              this.activeDevice = msg.data.device;
            }
            if (msg.data.detail) {
              this.detail = msg.data.detail;
            }
            this.notify();
          }
          break;

        case 'CACHE_STATUS':
          this.cacheState = msg.hasCachedModel ? 'cached' : 'not_cached';
          if (msg.hasCachedModel) {
            // Weights verified on disk: ready for instant zero-network execution
            if (this.status === 'NOT_INSTALLED' || this.status === 'FALLBACK_ENGINE') {
              this.status = 'READY';
              this.downloadProgress = 100;
              this.detail = 'Model weights verified in browser cache';
            }
          } else {
            // Cache was not found or was previously evicted
            if (this.status === 'READY') {
              this.status = 'NOT_INSTALLED';
              this.downloadProgress = 0;
              this.detail = 'Model not installed in cache';
            }
          }
          this.notify();
          break;

        case 'TOKEN_CHUNK':
          if (this.activeTokenCallback) {
            this.activeTokenCallback(msg.id, msg.chunk);
          }
          break;

        case 'GENERATION_COMPLETE':
          if (this.activeCompleteResolver) {
            this.activeCompleteResolver(msg);
          }
          break;

        case 'GENERATION_ABORTED':
          if (this.activeAbortResolver) {
            this.activeAbortResolver(msg.id);
          }
          break;

        case 'ERROR':
          this.errorMessage = msg.error;
          this.status = 'ERROR';
          if (this.activeRejecter) {
            this.activeRejecter(new Error(msg.error));
          }
          this.notify();
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[ASTRA LocalAIManager] Worker thread error:', err);
      const errMsg = err.message || 'Worker thread execution failure';
      this.status = 'ERROR';
      this.errorMessage = errMsg;
      if (this.activeRejecter) {
        this.activeRejecter(new Error(errMsg));
      }
      this.cleanupGeneration();
      this.terminateWorker();
      this.notify();
    };
  }

  /**
   * Cleanly terminates the background worker instance.
   */
  private terminateWorker() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {
        // ignore
      }
      this.worker = null;
    }
  }

  /**
   * Returns complete real-time information for UI components and providers.
   */
  public getModelInfo(): ModelInfo {
    return {
      name: 'ASTRA Local Health Core (SmolLM2-135M)',
      architecture: 'SmolLM2-135M-Instruct (INT4 ONNX)',
      parameters: '135M Parameters (INT4)',
      estimatedVRAM_MB: 180,
      status: this.status,
      downloadProgress: this.downloadProgress,
      webGpuAvailable: this.hasWebGPU,
      activeDevice: this.activeDevice,
      cacheState: this.cacheState,
      bytesLoaded: this.bytesLoaded,
      bytesTotal: this.bytesTotal,
      currentFile: this.currentFile,
      detail: this.detail,
      errorMessage: this.errorMessage,
    };
  }

  /**
   * Subscribes to model status and progress updates.
   */
  public subscribe(callback: (info: ModelInfo) => void): () => void {
    this.listeners.push(callback);
    callback(this.getModelInfo());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify() {
    const info = this.getModelInfo();
    this.listeners.forEach(cb => {
      try {
        cb(info);
      } catch (err) {
        console.error('[ASTRA LocalAIManager] Error in subscriber callback:', err);
      }
    });
  }

  /**
   * Checks whether the model files are already available in browser CacheStorage.
   * Runs directly on main thread via window.caches to avoid eager worker thread startup.
   */
  public async checkCache(modelId = DEFAULT_MODEL_ID): Promise<void> {
    try {
      if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
        const cacheNames = await window.caches.keys();
        const hasTransformersCache = cacheNames.includes('transformers-cache');
        if (hasTransformersCache) {
          const cache = await window.caches.open('transformers-cache');
          const requests = await cache.keys();
          const normalizedTarget = modelId.toLowerCase().replace('/', '_');
          const matchingUrls = requests
            .map(r => r.url.toLowerCase())
            .filter(url => url.includes(normalizedTarget) || url.includes('smollm2-135m'));

          const hasWeights = matchingUrls.some(url => url.includes('.onnx'));
          const hasTokenizer = matchingUrls.some(url => url.includes('tokenizer.json') || url.includes('tokenizer_config.json'));
          const isFullyCached = hasWeights && hasTokenizer;

          this.cacheState = isFullyCached ? 'cached' : 'not_cached';
          if (isFullyCached && (this.status === 'NOT_INSTALLED' || this.status === 'FALLBACK_ENGINE')) {
            this.status = 'READY';
            this.downloadProgress = 100;
            this.detail = 'Model weights verified in browser cache';
          }
          this.notify();
          return;
        }
      }
      this.cacheState = 'not_cached';
      this.notify();
    } catch (err: any) {
      console.warn('[ASTRA LocalAIManager] Cache check warning:', err?.message || err);
      this.cacheState = 'not_cached';
      this.notify();
    }
  }

  /**
   * Initiates download and persistent caching of model weights via worker.
   */
  public async downloadModel(modelId = DEFAULT_MODEL_ID): Promise<void> {
    if (this.status === 'DOWNLOADING') {
      return; // Prevent competing duplicate downloads
    }

    this.status = 'DOWNLOADING';
    this.downloadProgress = 0;
    this.errorMessage = undefined;
    this.detail = 'Connecting to model repository...';
    this.notify();

    const ok = this.postToWorker({
      type: 'INIT_MODEL',
      modelId,
      forceWasm: !this.hasWebGPU,
    });

    if (!ok) {
      this.status = 'UNSUPPORTED';
      this.errorMessage = 'Worker is unavailable in this environment';
      this.notify();
    }
  }

  /**
   * Releases in-memory model worker session without deleting downloaded weights from disk cache.
   */
  public releaseModel(): void {
    this.postToWorker({ type: 'UNLOAD_MODEL' });
    this.status = 'NOT_INSTALLED';
    this.detail = 'Model memory released. Weights remain cached for instant reload.';
    this.notify();
  }

  /**
   * Destructively purges the cached model weights from browser CacheStorage.
   */
  public clearCache(): void {
    this.postToWorker({ type: 'CLEAR_CACHE' });
    this.status = 'NOT_INSTALLED';
    this.downloadProgress = 0;
    this.cacheState = 'not_cached';
    this.bytesLoaded = undefined;
    this.bytesTotal = undefined;
    this.currentFile = undefined;
    this.detail = 'Model cache deleted from disk';
    this.notify();
  }

  /**
   * Generates tokens via worker inference with token streaming callback.
   */
  public async generateText(
    id: string,
    prompt: string,
    onToken?: (chunk: string) => void,
    options?: { maxNewTokens?: number; temperature?: number }
  ): Promise<{ fullText: string; tokensGenerated: number; durationMs: number; device: InferenceDevice }> {
    const worker = this.getWorker();
    if (!worker) {
      throw new Error('Local inference worker is not supported in this environment');
    }

    // Guard against orphaned concurrent promises
    if (this.activeRejecter) {
      this.activeRejecter(new Error('Inference request superseded by a new prompt'));
      this.cleanupGeneration();
    }

    this.activeTokenCallback = onToken ? (genId, chunk) => {
      if (genId === id) onToken(chunk);
    } : null;

    return new Promise((resolve, reject) => {
      const timeoutMs = 60000; // 60s safety timeout for long responses
      const timer = setTimeout(() => {
        this.cleanupGeneration();
        this.abortGeneration(id);
        reject(new Error('Inference timed out after 60 seconds'));
      }, timeoutMs);

      this.activeCompleteResolver = (msg) => {
        clearTimeout(timer);
        this.cleanupGeneration();
        resolve({
          fullText: msg.fullText,
          tokensGenerated: msg.tokensGenerated,
          durationMs: msg.durationMs,
          device: msg.device,
        });
      };

      this.activeRejecter = (err) => {
        clearTimeout(timer);
        this.cleanupGeneration();
        reject(err);
      };

      this.activeAbortResolver = (abortedId) => {
        if (abortedId === id) {
          clearTimeout(timer);
          this.cleanupGeneration();
          reject(new Error('Generation cancelled by user'));
        }
      };

      this.postToWorker({
        type: 'GENERATE',
        id,
        prompt,
        maxNewTokens: options?.maxNewTokens || 350,
        temperature: options?.temperature || 0.6,
      });
    });
  }

  /**
   * Aborts an active text generation run.
   */
  public abortGeneration(id: string): void {
    this.postToWorker({ type: 'ABORT_GENERATION', id });
  }

  private cleanupGeneration() {
    this.activeTokenCallback = null;
    this.activeCompleteResolver = null;
    this.activeRejecter = null;
    this.activeAbortResolver = null;
  }
}

export const localAIManager = new LocalAIManager();
