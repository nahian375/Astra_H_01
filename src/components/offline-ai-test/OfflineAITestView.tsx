/**
 * ASTRA Health - Offline AI Isolated Diagnostic Screen
 * 
 * Standalone verification lab running completely independent of the existing chat UI.
 * Enforces explicit 7-stage lifecycle:
 * IDLE → DOWNLOADING → DOWNLOADED → INITIALIZING → READY → GENERATING → ERROR
 * 
 * Prevents auto-initialization, isolates download from session allocation,
 * and handles recoverable worker errors cleanly without crashing preview.
 */

import React, { useState, useEffect } from 'react';
import { 
  offlineAIClient, 
  OfflineAIState 
} from '../../offline-ai/client';
import { 
  offlineAITestHarness 
} from '../../offline-ai/test-harness';
import { 
  OFFLINE_MODEL_CATALOG, 
  getModelCatalogEntry, 
  DEFAULT_OFFLINE_MODEL_ID 
} from '../../offline-ai/catalog';
import { 
  TestStepResult, 
  ModelCatalogEntry, 
  HardwareCapabilities 
} from '../../offline-ai/types';
import { 
  Cpu, 
  HardDrive, 
  Play, 
  Square, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  Download, 
  Layers, 
  Send, 
  Zap, 
  Activity, 
  ShieldCheck, 
  Lock,
  ArrowRight
} from 'lucide-react';

export function OfflineAITestView() {
  const [clientState, setClientState] = useState<OfflineAIState>(() => offlineAIClient.getState());
  const [testResults, setTestResults] = useState<TestStepResult[]>(() => offlineAITestHarness.getResults());
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_OFFLINE_MODEL_ID);
  const [isRunningAllTests, setIsRunningAllTests] = useState(false);
  const [hardware, setHardware] = useState<HardwareCapabilities | null>(null);
  
  // Playground state
  const [testPrompt, setTestPrompt] = useState('What are the primary cardiovascular countermeasures on a Mars mission?');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMetrics, setGenerationMetrics] = useState<{
    totalTokens?: number;
    tokensPerSec?: number;
    durationMs?: number;
    backendUsed?: string;
  } | null>(null);

  useEffect(() => {
    const unsubClient = offlineAIClient.subscribe(s => setClientState(s));
    const unsubHarness = offlineAITestHarness.subscribe(r => setTestResults(r));

    // Lazy mount checks (never loads weights to memory)
    offlineAITestHarness.runStep1();
    offlineAIClient.probeHardware().then(hw => setHardware(hw));
    offlineAIClient.checkCache(selectedModelId);

    return () => {
      unsubClient();
      unsubHarness();
    };
  }, []);

  const selectedModel = getModelCatalogEntry(selectedModelId) || OFFLINE_MODEL_CATALOG[0];

  const handleSelectModel = async (model: ModelCatalogEntry) => {
    if (model.isLockedForDiagnosis) {
      return; // Locked to prevent memory exhaustion
    }
    setSelectedModelId(model.id);
    await offlineAIClient.checkCache(model.id);
  };

  const handleStartDownloadOnly = async () => {
    try {
      await offlineAIClient.downloadModel(selectedModelId);
    } catch (err: any) {
      console.error('Download error:', err);
    }
  };

  const handleStartInitializeOnly = async () => {
    try {
      await offlineAIClient.initializeModel(selectedModelId);
    } catch (err: any) {
      console.error('Initialization error:', err);
    }
  };

  const handleRunAllTests = async () => {
    setIsRunningAllTests(true);
    try {
      // Step 1: Lazy check
      await offlineAITestHarness.runStep1();

      // Step 2: Download Only (stops at DOWNLOADED)
      const dlSuccess = await offlineAITestHarness.runDownloadOnly(selectedModelId);
      if (!dlSuccess) {
        setIsRunningAllTests(false);
        return;
      }

      // Step 3: Explicit Initialize
      const initSuccess = await offlineAITestHarness.runInitOnly(selectedModelId);
      if (!initSuccess) {
        setIsRunningAllTests(false);
        return;
      }

      // Step 4: First prompt
      await offlineAITestHarness.runFirstPrompt();

      // Step 5: Second prompt
      await offlineAITestHarness.runSecondPrompt();

      // Step 6: UI Responsiveness check
      await offlineAITestHarness.runResponsivenessCheck();

      // Step 7: Strict offline check
      await offlineAITestHarness.runStrictOfflineCheck();

      // Step 8: Error containment check
      await offlineAITestHarness.runErrorContainmentCheck();

      // Step 9: Cache retention check
      await offlineAITestHarness.runCacheRetentionCheck(selectedModelId);

    } finally {
      setIsRunningAllTests(false);
    }
  };

  const handlePlaygroundSend = async () => {
    if (!testPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setPlaygroundOutput('');
    setGenerationMetrics(null);

    try {
      const result = await offlineAIClient.generate({
        prompt: testPrompt,
        systemPrompt: 'You are ASTRA, an autonomous Mars expedition medical officer. Provide concise, clinical guidance.',
        config: { maxNewTokens: 140, temperature: 0.35 },
        onToken: (chunk) => {
          setPlaygroundOutput(prev => prev + chunk);
        },
      });

      setPlaygroundOutput(result.text);
      setGenerationMetrics(result.metrics);
    } catch (err: any) {
      setPlaygroundOutput(prev => prev + `\n\n[Inference Error: ${err.message}]`);
    } finally {
      setIsGenerating(false);
    }
  };

  const STAGES: OfflineAIState['status'][] = [
    'IDLE',
    'DOWNLOADING',
    'DOWNLOADED',
    'INITIALIZING',
    'READY',
    'GENERATING',
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                OFFLINE AI DIAGNOSTIC LABORATORY
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Controlled Multi-Stage Neural Pipeline
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Cpu className="w-6 h-6 text-purple-400" />
              Autonomous Offline AI Engine
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Diagnostic environment with separated Download and Initialization stages. 
              Tests the ultra-compact SmolLM2 135M Instruct model with conservative WebGPU/WASM runtime selection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunAllTests}
              disabled={isRunningAllTests || isGenerating}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer ${
                isRunningAllTests
                  ? 'bg-amber-950 text-amber-300 border border-amber-500/50 animate-pulse'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30'
              }`}
            >
              {isRunningAllTests ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  Running 9-Step Test Suite...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Full 9-Step Verification
                </>
              )}
            </button>

            {clientState.status === 'READY' && (
              <button
                onClick={() => offlineAIClient.unloadModel()}
                className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition flex items-center gap-1.5 cursor-pointer"
                title="Release model memory while keeping weights in CacheStorage"
              >
                Unload Memory
              </button>
            )}

            <button
              onClick={() => offlineAIClient.purgeCache(selectedModelId)}
              className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-rose-300 font-mono text-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Purge cached model weights from disk"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              Purge Cache
            </button>
          </div>
        </div>

        {/* 7-Stage Visual Lifecycle Stepper */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Execution Lifecycle State Machine</span>
            {clientState.lastStageTransitionMs !== undefined && (
              <span className="text-purple-300 font-bold">
                Last Transition: {clientState.lastStageTransitionMs}ms
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {STAGES.map((stage) => {
              const isCurrent = clientState.status === stage;
              const isPassed = STAGES.indexOf(stage) < STAGES.indexOf(clientState.status);
              return (
                <div
                  key={stage}
                  className={`px-3 py-2 rounded-xl border text-center font-mono text-xs transition-all ${
                    isCurrent
                      ? 'bg-purple-950 border-purple-500 text-purple-200 shadow-md ring-1 ring-purple-500/50 font-bold animate-pulse'
                      : isPassed
                      ? 'bg-slate-900/90 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="text-[9px] text-slate-400">STAGE {STAGES.indexOf(stage) + 1}</div>
                  <div className="truncate">{stage}</div>
                </div>
              );
            })}
          </div>
          {clientState.status === 'ERROR' && (
            <div className="mt-2.5 p-3 rounded-xl bg-rose-950/70 border border-rose-500/60 text-xs font-mono text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>ERROR STATE:</strong> {clientState.errorMessage || clientState.statusDetail}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => offlineAIClient.retry()}
                  className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold transition text-xs cursor-pointer"
                >
                  Retry Initialization
                </button>
                <button
                  onClick={() => offlineAIClient.unloadModel()}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition text-xs cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controlled Action Cards: Download & Initialize */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step A: Download Assets Card */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-cyan-400" />
              Stage 1: Download Model to Disk
            </h3>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
              clientState.status === 'DOWNLOADED' || clientState.status === 'READY'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {clientState.status === 'DOWNLOADED' || clientState.status === 'READY' ? 'DOWNLOAD COMPLETE' : 'PENDING'}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Downloads weights (~175 MB) and tokenizer files into browser CacheStorage. 
            <strong> Does NOT create an ONNX session</strong> or touch WebGPU/WASM memory.
          </p>
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              Target: <strong className="text-slate-200">{selectedModel.name}</strong>
            </span>
            <button
              onClick={handleStartDownloadOnly}
              disabled={clientState.status === 'DOWNLOADING'}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                clientState.status === 'DOWNLOADING'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 animate-pulse'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {clientState.status === 'DOWNLOADING' ? 'Downloading...' : '1. Download Model Assets'}
            </button>
          </div>
        </div>

        {/* Step B: Explicit Initialization Card */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              Stage 2: Explicit Session Initialization
            </h3>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
              clientState.status === 'READY'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {clientState.status === 'READY' ? 'SESSION READY' : 'NOT INITIALIZED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Loads cached weights from disk into active runtime memory. 
            Conservative hardware probe avoids software WebGPU to guarantee preview stability.
          </p>
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              Active Backend: <strong className="text-purple-300">{clientState.activeBackend.toUpperCase()}</strong>
            </span>
            <button
              onClick={handleStartInitializeOnly}
              disabled={clientState.status !== 'DOWNLOADED' && clientState.status !== 'ERROR'}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1.5 shadow-md ${
                clientState.status === 'DOWNLOADED' || clientState.status === 'ERROR'
                  ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer ring-2 ring-purple-400/40 animate-pulse'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              2. Initialize Neural Session
            </button>
          </div>
        </div>
      </div>

      {/* Model Download Progress Bar (When downloading) */}
      {clientState.status === 'DOWNLOADING' && clientState.downloadProgress && (
        <div className="p-4 rounded-xl bg-cyan-950/60 border border-cyan-500/50 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-cyan-200">
            <span className="flex items-center gap-2 font-bold">
              <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              Downloading On-Device Weights ({selectedModel.name})
            </span>
            <span className="font-bold text-cyan-300 text-sm">{clientState.downloadProgress.percent}%</span>
          </div>
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full rounded-full transition-all duration-150"
              style={{ width: `${clientState.downloadProgress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300/80">
            <span className="truncate max-w-md">{clientState.downloadProgress.file}</span>
            <span>
              {((clientState.downloadProgress.loadedBytes || 0) / (1024 * 1024)).toFixed(1)} / {((clientState.downloadProgress.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB
            </span>
          </div>
        </div>
      )}

      {/* Model Catalog Selection Grid (Diagnostics) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Model Catalog (Diagnosis Mode)
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            Active: <strong className="text-purple-300">{selectedModel.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {OFFLINE_MODEL_CATALOG.map((model) => {
            const isSelected = model.id === selectedModelId;
            return (
              <div
                key={model.id}
                onClick={() => handleSelectModel(model)}
                className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                  model.isLockedForDiagnosis
                    ? 'bg-slate-950/40 border-slate-800 opacity-60 cursor-not-allowed'
                    : isSelected
                    ? 'bg-slate-900/90 border-purple-500 shadow-md shadow-purple-950/40 ring-1 ring-purple-500/50 cursor-pointer'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 cursor-pointer'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                      {model.parameterCount}
                    </span>
                    {model.isDiagnosticDefault ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-bold">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Diagnostic Default
                      </span>
                    ) : model.isLockedForDiagnosis ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Locked
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Alternative
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-100 mb-1">{model.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-2">{model.notes}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Download Size:</span>
                    <strong className="text-slate-200">~{model.downloadSizeMB} MB</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Precision:</span>
                    <strong className="text-slate-200">{model.precision.toUpperCase()}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Backends:</span>
                    <span className="text-cyan-400">{model.supportedBackends.join(', ').toUpperCase()}</span>
                  </div>

                  {model.compatibilityWarning && (
                    <div className="mt-2 p-2 rounded bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-300 font-sans leading-tight">
                      {model.compatibilityWarning}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hardware Audit & Storage Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hardware Status */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> WebGPU Check
            </span>
            <span className={hardware?.webGpuSupported && !hardware?.isSoftwareGpu ? 'text-emerald-400' : 'text-slate-400'}>
              {hardware?.webGpuSupported ? (hardware?.isSoftwareGpu ? 'SOFTWARE (DISABLED)' : 'HARDWARE READY') : 'NOT DETECTED'}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Adapter Vendor:</span>
              <span className="truncate max-w-[140px]">{hardware?.adapterInfo?.vendor || 'Standard GPU'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Software SwiftShader:</span>
              <span className={hardware?.isSoftwareGpu ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                {hardware?.isSoftwareGpu ? 'YES (Bypassed to WASM)' : 'NO (Safe)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">FP16 Shaders:</span>
              <span>{hardware?.webGpuHasFp16 ? 'SUPPORTED' : 'NOT SUPPORTED'}</span>
            </div>
          </div>
        </div>

        {/* Storage Quota */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> CacheStorage
            </span>
            <span className="text-cyan-300">
              {hardware?.storageEstimate?.availableMB 
                ? `${hardware.storageEstimate.availableMB.toLocaleString()} MB FREE` 
                : 'AVAILABLE'}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Origin Quota:</span>
              <span>{hardware?.storageEstimate?.quotaMB?.toLocaleString() || 'Default'} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">App Usage:</span>
              <span>{hardware?.storageEstimate?.usageMB || 0} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Model Download Size:</span>
              <span>~{selectedModel.downloadSizeMB} MB</span>
            </div>
          </div>
        </div>

        {/* Runtime Session State */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-400" /> Session Status
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              clientState.status === 'READY' 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' 
                : clientState.status === 'DOWNLOADING' || clientState.status === 'INITIALIZING'
                ? 'bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse'
                : clientState.status === 'DOWNLOADED'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                : clientState.status === 'ERROR'
                ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {clientState.status}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Selected Device:</span>
              <span className="text-purple-300 font-bold">{clientState.activeBackend.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">WASM Threads:</span>
              <span>{hardware?.wasmThreads || 1} (Isolated: {hardware?.crossOriginIsolated ? 'YES' : 'NO'})</span>
            </div>
            <div className="flex justify-between truncate">
              <span className="text-slate-500">Detail:</span>
              <span className="truncate max-w-[150px] text-slate-400">{clientState.statusDetail || 'Idle'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sequential Verification Suite (Phase 7 Steps 1 - 9) */}
      <div className="space-y-3">
        <h2 className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Sequential Diagnostic Verification Suite
        </h2>

        <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden">
          {testResults.map((step) => {
            return (
              <div key={step.stepId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div className="space-y-1 max-w-2xl">
                  <div className="font-bold text-slate-200 flex items-center gap-2">
                    <span>{step.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 whitespace-pre-line leading-relaxed font-sans">
                    {step.detail}
                  </p>
                  {step.error && (
                    <p className="text-[11px] text-rose-400 font-mono">
                      Error: {step.error}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {step.durationMs !== undefined && (
                    <span className="text-[10px] text-slate-500">
                      {step.durationMs}ms
                    </span>
                  )}

                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${
                    step.status === 'PASSED'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                      : step.status === 'RUNNING'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse'
                      : step.status === 'FAILED'
                      ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                      : step.status === 'SKIPPED'
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-900 text-slate-500 border border-slate-800'
                  }`}>
                    {step.status === 'PASSED' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    {step.status === 'RUNNING' && <RotateCcw className="w-3 h-3 animate-spin text-amber-400" />}
                    {step.status === 'FAILED' && <AlertCircle className="w-3 h-3 text-rose-400" />}
                    <span>{step.status}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Local Inference Playground */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Live Inference Playground
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Submit prompts directly to the offline worker. Tests token streaming, generation speed, and device binding.
            </p>
          </div>

          {generationMetrics && (
            <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-purple-500/30 text-[11px] font-mono text-purple-300">
              <span>{generationMetrics.totalTokens} Tokens</span>
              <span>•</span>
              <span>{generationMetrics.tokensPerSec} tok/s</span>
              <span>•</span>
              <span>{generationMetrics.durationMs}ms</span>
              <span>•</span>
              <span className="font-bold text-purple-400">{generationMetrics.backendUsed?.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Input Box */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Enter clinical test query (e.g. 'What are the countermeasure protocols on Mars?')..."
              className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-purple-500 font-sans"
              disabled={isGenerating || clientState.status !== 'READY'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating && clientState.status === 'READY') {
                  e.preventDefault();
                  handlePlaygroundSend();
                }
              }}
            />

            {isGenerating ? (
              <button
                onClick={() => offlineAIClient.abortGeneration()}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Square className="w-4 h-4" /> Cancel
              </button>
            ) : (
              <button
                onClick={handlePlaygroundSend}
                disabled={clientState.status !== 'READY'}
                className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1.5 shadow-md ${
                  clientState.status === 'READY'
                    ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" /> Generate
              </button>
            )}
          </div>

          {clientState.status !== 'READY' && (
            <div className="flex items-center justify-between text-xs font-mono text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-500/30">
              <span>Model session not active. Complete Stage 1 (Download) and Stage 2 (Initialize):</span>
              {clientState.status === 'DOWNLOADED' ? (
                <button
                  onClick={handleStartInitializeOnly}
                  className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold transition cursor-pointer"
                >
                  Initialize Model
                </button>
              ) : (
                <button
                  onClick={handleStartDownloadOnly}
                  className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition cursor-pointer"
                >
                  Download Assets (~175 MB)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Output Console */}
        <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 min-h-[140px] max-h-[300px] overflow-y-auto font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
          {playgroundOutput ? (
            <div>{playgroundOutput}</div>
          ) : (
            <div className="text-slate-600 italic">
              Model output tokens will stream here in real-time...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
