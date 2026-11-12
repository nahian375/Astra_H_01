/**
 * ASTRA Health - Offline AI Client (Main Thread Coordinator)
 * 
 * Manages the dedicated Web Worker, enforces the 7-stage lifecycle:
 * IDLE → DOWNLOADING → DOWNLOADED → INITIALIZING → READY → GENERATING → ERROR
 * 
 * Provides explicit stage transitions, elapsed time telemetry, duplicate-action guarding,
 * worker crash recovery, and guarantees that models are NEVER automatically loaded on mount.
 */

import { 
  OfflineModelStatus, 
  DeviceBackend, 
  HardwareCapabilities, 
  DownloadProgress, 
  OfflineGenerationResult, 
  WorkerInMessage, 
  WorkerOutMessage, 
  GenerationConfig 
} from './types';
import { OfflineStorageManager } from './storage';
import { DEFAULT_OFFLINE_MODEL_ID, getModelCatalogEntry } from './catalog';

export interface OfflineAIState {
  status: OfflineModelStatus;
  activeModelId: string;
  activeBackend: DeviceBackend;
  hardware: HardwareCapabilities | null;
  downloadProgress: DownloadProgress | null;
  statusDetail?: string;
  errorMessage?: string;
  lastStageTransitionMs?: number;
}

type StateListener = (state: OfflineAIState) => void;

class OfflineAIClient {
  private worker: Worker | null = null;
  private state: OfflineAIState = {
    status: 'IDLE',
    activeModelId: DEFAULT_OFFLINE_MODEL_ID,
    activeBackend: 'wasm',
    hardware: null,
    downloadProgress: null,
    statusDetail: 'Offline AI is uninitialized. Model weights not loaded in memory.',
  };

  private stageStartTime = performance.now();
  private listeners: StateListener[] = [];
  private activeTokenCallback: ((token: string) => void) | null = null;
  private activeGenerateResolver: ((result: OfflineGenerationResult) => void) | null = null;
  private activeGenerateRejecter: ((err: Error) => void) | null = null;
  private activeInitResolver: (() => void) | null = null;
  private activeInitRejecter: ((err: Error) => void) | null = null;
  private activeDownloadResolver: (() => void) | null = null;
  private activeDownloadRejecter: ((err: Error) => void) | null = null;

  /**
   * Lazily spawns the dedicated Web Worker.
   */
  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        throw new Error('Web Workers are not supported in this runtime environment.');
      }
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.setupWorkerListeners(this.worker);
    }
    return this.worker;
  }

  private post(msg: WorkerInMessage) {
    const w = this.getWorker();
    w.postMessage(msg);
  }

  private transitionTo(newStatus: OfflineModelStatus, detail?: string, explicitElapsedMs?: number) {
    const now = performance.now();
    const elapsedMs = explicitElapsedMs !== undefined ? explicitElapsedMs : Math.round(now - this.stageStartTime);
    const oldStatus = this.state.status;

    this.stageStartTime = now;
    this.state.status = newStatus;
    this.state.lastStageTransitionMs = elapsedMs;
    if (detail) this.state.statusDetail = detail;

    console.info(`[ASTRA Offline AI Stage] ${oldStatus} -> ${newStatus} (${elapsedMs}ms)${detail ? ` | ${detail}` : ''}`);
    this.notify();
  }

  private setupWorkerListeners(worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'HARDWARE_REPORT':
          this.state.hardware = msg.payload;
          this.notify();
          break;

        case 'STATUS_CHANGE':
          if (msg.status === 'ERROR') {
            this.state.errorMessage = msg.detail;
          } else if (msg.status === 'READY') {
            this.state.errorMessage = undefined;
          }
          this.transitionTo(msg.status, msg.detail, msg.elapsedMs);
          break;

        case 'DOWNLOAD_PROGRESS':
          this.state.downloadProgress = msg.progress;
          this.notify();
          break;

        case 'DOWNLOAD_COMPLETE':
          this.state.downloadProgress = null;
          if (this.activeDownloadResolver) {
            this.activeDownloadResolver();
            this.activeDownloadResolver = null;
            this.activeDownloadRejecter = null;
          }
          this.transitionTo(
            'DOWNLOADED', 
            `Assets stored in CacheStorage (${msg.fileCount} files, ${(msg.totalBytes / (1024 * 1024)).toFixed(1)} MB). Click Initialize to load.`,
            msg.durationMs
          );
          break;

        case 'MODEL_READY':
          this.state.activeModelId = msg.modelId;
          this.state.activeBackend = msg.backend;
          this.state.errorMessage = undefined;
          if (this.activeInitResolver) {
            this.activeInitResolver();
            this.activeInitResolver = null;
            this.activeInitRejecter = null;
          }
          this.transitionTo('READY', `Model ready on ${msg.backend.toUpperCase()} session`, msg.durationMs);
          break;

        case 'STREAM_TOKEN':
          if (this.activeTokenCallback) {
            this.activeTokenCallback(msg.token);
          }
          break;

        case 'GENERATION_COMPLETE':
          if (this.activeGenerateResolver) {
            this.activeGenerateResolver(msg.payload);
          }
          this.cleanupGeneration();
          this.transitionTo('READY', `Generation completed in ${msg.payload.metrics.durationMs}ms`);
          break;

        case 'GENERATION_ABORTED':
          if (this.activeGenerateRejecter) {
            this.activeGenerateRejecter(new Error('Generation cancelled by user'));
          }
          this.cleanupGeneration();
          this.transitionTo('READY', 'Generation aborted');
          break;

        case 'ERROR':
          this.state.errorMessage = msg.message;
          if (this.activeDownloadRejecter) {
            this.activeDownloadRejecter(new Error(msg.message));
            this.activeDownloadResolver = null;
            this.activeDownloadRejecter = null;
          }
          if (this.activeInitRejecter) {
            this.activeInitRejecter(new Error(msg.message));
            this.activeInitResolver = null;
            this.activeInitRejecter = null;
          }
          if (this.activeGenerateRejecter) {
            this.activeGenerateRejecter(new Error(msg.message));
          }
          this.cleanupGeneration();
          this.transitionTo('ERROR', `Error in ${msg.stage || 'subsystem'}: ${msg.message}`);
          break;
      }
    };

    worker.onerror = (err: ErrorEvent) => {
      console.error('[OfflineAIClient] Background worker error caught:', err);
      const errMsg = err.message || 'Worker thread execution error';
      this.state.errorMessage = errMsg;
      if (this.activeDownloadRejecter) this.activeDownloadRejecter(new Error(errMsg));
      if (this.activeInitRejecter) this.activeInitRejecter(new Error(errMsg));
      if (this.activeGenerateRejecter) this.activeGenerateRejecter(new Error(errMsg));
      this.cleanupGeneration();
      this.terminate();
      this.transitionTo('ERROR', `Worker thread crash: ${errMsg}. Click Retry to restart worker.`);
    };

    worker.onmessageerror = (err) => {
      console.error('[OfflineAIClient] Worker message deserialization error:', err);
      this.transitionTo('ERROR', 'Worker communication error');
    };
  }

  private cleanupGeneration() {
    this.activeTokenCallback = null;
    this.activeGenerateResolver = null;
    this.activeGenerateRejecter = null;
  }

  public getState(): OfflineAIState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach(l => l(s));
  }

  /**
   * Safely checks hardware capabilities without eager worker attachment.
   */
  public async probeHardware(): Promise<HardwareCapabilities> {
    const storageEst = await OfflineStorageManager.getStorageEstimate();
    return new Promise((resolve) => {
      const unsub = this.subscribe((state) => {
        if (state.hardware) {
          unsub();
          const hw = { ...state.hardware, storageEstimate: storageEst };
          this.state.hardware = hw;
          resolve(hw);
        }
      });
      this.post({ type: 'PROBE_HARDWARE' });
    });
  }

  /**
   * Inspects CacheStorage on disk.
   * If assets exist, transitions to DOWNLOADED (NEVER auto-initializes into memory!).
   */
  public async checkCache(modelId: string = this.state.activeModelId): Promise<boolean> {
    const cacheResult = await OfflineStorageManager.verifyModelInCache(modelId);
    if (cacheResult.isCached) {
      // Note: Never auto-load into memory. Status is DOWNLOADED, awaiting explicit user Initialize.
      if (this.state.status === 'IDLE' || this.state.status === 'ERROR') {
        this.transitionTo(
          'DOWNLOADED', 
          `Verified ${cacheResult.cachedFiles.length} files in browser cache (${(cacheResult.totalBytes / (1024 * 1024)).toFixed(1)} MB). Ready to initialize.`
        );
      }
    } else {
      if (this.state.status !== 'DOWNLOADING' && this.state.status !== 'READY') {
        this.transitionTo('IDLE', 'Model files not installed in browser storage.');
      }
    }
    return cacheResult.isCached;
  }

  /**
   * STAGE 1: Explicit Download.
   * Downloads assets to CacheStorage, stops at 'DOWNLOADED'.
   */
  public async downloadModel(modelId: string = this.state.activeModelId): Promise<void> {
    const entry = getModelCatalogEntry(modelId);
    if (!entry) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }

    if (entry.isLockedForDiagnosis) {
      throw new Error(`Model ${modelId} is locked during diagnosis to prevent memory crashes.`);
    }

    if (this.state.status === 'DOWNLOADING') {
      console.warn('[OfflineAIClient] Download already in progress');
      return;
    }

    this.state.activeModelId = modelId;
    this.state.errorMessage = undefined;
    this.transitionTo('DOWNLOADING', `Downloading weights for ${modelId}...`);

    return new Promise<void>((resolve, reject) => {
      this.activeDownloadResolver = resolve;
      this.activeDownloadRejecter = reject;
      this.post({ type: 'DOWNLOAD_MODEL', modelId });
    });
  }

  /**
   * STAGE 2: Explicit Initialization.
   * Loads cached weights into an active session. Only invoked upon explicit user click.
   */
  public async initializeModel(
    modelId: string = this.state.activeModelId,
    devicePreference: 'auto' | DeviceBackend = 'auto'
  ): Promise<void> {
    if (this.state.status === 'INITIALIZING') {
      console.warn('[OfflineAIClient] Model initialization already in progress');
      return;
    }

    if (this.state.status === 'READY') {
      console.info('[OfflineAIClient] Model is already ready');
      return;
    }

    // Pre-flight check: Ensure required assets are in CacheStorage before sending to worker
    const verification = await OfflineStorageManager.verifyModelAssetsPresent(modelId);
    if (!verification.allPresent) {
      const errMsg = `Model assets (~175 MB) are not yet downloaded in browser storage. Please click "Download Assets" first. Missing: ${verification.missingFiles.join(', ')}`;
      this.state.errorMessage = errMsg;
      this.transitionTo('IDLE', errMsg);
      throw new Error(errMsg);
    }

    this.state.activeModelId = modelId;
    this.state.errorMessage = undefined;
    this.transitionTo('INITIALIZING', `Loading model ${modelId} from CacheStorage into active session...`);

    return new Promise<void>((resolve, reject) => {
      this.activeInitResolver = resolve;
      this.activeInitRejecter = reject;
      this.post({
        type: 'INITIALIZE_MODEL',
        modelId,
        devicePreference,
      });
    });
  }

  /**
   * STAGE 3: Inference Generation.
   */
  public async generate(params: {
    prompt: string;
    systemPrompt?: string;
    config?: GenerationConfig;
    onToken?: (token: string) => void;
  }): Promise<OfflineGenerationResult> {
    if (this.state.status !== 'READY') {
      throw new Error(`Cannot generate: Model is in '${this.state.status}' state. Initialize model first.`);
    }

    const id = `gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.activeTokenCallback = params.onToken || null;
    this.transitionTo('GENERATING', 'Synthesizing response...');

    return new Promise<OfflineGenerationResult>((resolve, reject) => {
      this.activeGenerateResolver = resolve;
      this.activeGenerateRejecter = reject;

      this.post({
        type: 'GENERATE',
        id,
        prompt: params.prompt,
        systemPrompt: params.systemPrompt,
        config: params.config,
      });
    });
  }

  /**
   * Aborts active generation.
   */
  public abortGeneration(): void {
    if (this.worker) {
      this.post({ type: 'ABORT_GENERATION', id: 'all' });
    }
  }

  /**
   * Safely unloads the model from memory while keeping files in CacheStorage.
   */
  public unloadModel(): void {
    if (this.worker) {
      this.post({ type: 'UNLOAD_MODEL' });
    }
    this.transitionTo('DOWNLOADED', 'Model session released from memory. Files remain cached on disk.');
  }

  /**
   * Retries initialization if previously failed.
   */
  public async retry(): Promise<void> {
    this.terminate();
    await this.initializeModel(this.state.activeModelId);
  }

  /**
   * Completely terminates the worker instance.
   */
  public terminate(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }

  /**
   * Purges cache and resets state to IDLE.
   */
  public async purgeCache(modelId?: string): Promise<void> {
    this.terminate();
    await OfflineStorageManager.purgeModelCache(modelId);
    this.state.downloadProgress = null;
    this.state.errorMessage = undefined;
    this.transitionTo('IDLE', 'Model cache purged from disk.');
  }
}

export const offlineAIClient = new OfflineAIClient();
