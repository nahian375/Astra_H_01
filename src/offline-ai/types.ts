/**
 * ASTRA Health - Offline AI Architecture Types
 * Clean, isolated type definitions for the offline neural model subsystem.
 * Strictly enforces separated lifecycle stages:
 * IDLE → DOWNLOADING → DOWNLOADED → INITIALIZING → READY → GENERATING → ERROR
 */

export type OfflineModelStatus = 
  | 'IDLE'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'INITIALIZING'
  | 'READY'
  | 'GENERATING'
  | 'ERROR';

export type DeviceBackend = 'webgpu' | 'wasm';

export interface ModelCatalogEntry {
  id: string;
  name: string;
  family: 'Qwen' | 'SmolLM' | 'Llama' | 'Other';
  parameterCount: string;
  precision: 'q4' | 'q4f16' | 'fp16' | 'int4';
  downloadSizeMB: number;
  vramRequiredMB: number;
  diskSpaceRequiredMB: number;
  supportedBackends: DeviceBackend[];
  requiresFp16: boolean;
  license: string;
  hfUrl: string;
  isRecommendedForBrowser: boolean;
  isDiagnosticDefault?: boolean;
  isLockedForDiagnosis?: boolean;
  notes: string;
  compatibilityWarning?: string;
  requiredFiles: string[];
}

export interface HardwareCapabilities {
  webGpuSupported: boolean;
  webGpuHasFp16: boolean;
  isSoftwareGpu: boolean;
  adapterInfo?: {
    vendor?: string;
    architecture?: string;
    description?: string;
  };
  crossOriginIsolated: boolean;
  wasmThreads: number;
  storageEstimate?: {
    quotaMB: number;
    usageMB: number;
    availableMB: number;
  };
}

export interface DownloadProgress {
  modelId: string;
  file: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  overallPercent: number;
  speedMBs?: number;
}

export interface GenerationConfig {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
  doSample?: boolean;
  repetitionPenalty?: number;
}

export interface GenerationMetrics {
  totalTokens: number;
  durationMs: number;
  tokensPerSec: number;
  backendUsed: DeviceBackend;
  modelId: string;
}

export interface OfflineGenerationResult {
  id: string;
  text: string;
  metrics: GenerationMetrics;
  modelId: string;
  isNeural: true;
}

// Dedicated Web Worker Protocol Messages
export type WorkerInMessage =
  | { type: 'PROBE_HARDWARE' }
  | { type: 'CHECK_CACHE'; modelId: string }
  | { type: 'DOWNLOAD_MODEL'; modelId: string }
  | { type: 'INITIALIZE_MODEL'; modelId: string; devicePreference?: 'auto' | DeviceBackend }
  | { type: 'GENERATE'; id: string; prompt: string; systemPrompt?: string; config?: GenerationConfig }
  | { type: 'ABORT_GENERATION'; id: string }
  | { type: 'UNLOAD_MODEL' }
  | { type: 'PURGE_CACHE'; modelId?: string };

export type WorkerOutMessage =
  | { type: 'HARDWARE_REPORT'; payload: HardwareCapabilities }
  | { type: 'STATUS_CHANGE'; status: OfflineModelStatus; detail?: string; elapsedMs?: number }
  | { type: 'CACHE_REPORT'; modelId: string; isCached: boolean; cachedFiles: string[]; totalBytes: number }
  | { type: 'DOWNLOAD_PROGRESS'; progress: DownloadProgress }
  | { type: 'DOWNLOAD_COMPLETE'; modelId: string; totalBytes: number; fileCount: number; durationMs: number }
  | { type: 'MODEL_READY'; modelId: string; backend: DeviceBackend; durationMs: number; memoryMB?: number }
  | { type: 'STREAM_TOKEN'; id: string; token: string }
  | { type: 'GENERATION_COMPLETE'; payload: OfflineGenerationResult }
  | { type: 'GENERATION_ABORTED'; id: string }
  | { type: 'ERROR'; code: string; message: string; fatal: boolean; stage?: string };

export interface TestStepResult {
  stepId: string;
  title: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';
  detail: string;
  durationMs?: number;
  error?: string;
  data?: any;
}
