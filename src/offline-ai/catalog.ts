/**
 * ASTRA Health - Offline Neural Model Catalog & Diagnostic Selection
 * 
 * Sets onnx-community/Qwen2.5-0.5B-Instruct as the primary diagnostic model.
 * Locks heavy 1.5B and 4B models during diagnosis to prevent memory exhaustion crashes.
 */

import { ModelCatalogEntry } from './types';

export const OFFLINE_MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
    name: 'SmolLM2 135M Instruct (Browser WASM Ultra-Compact)',
    family: 'SmolLM',
    parameterCount: '135 Million',
    precision: 'q4',
    downloadSizeMB: 175,
    vramRequiredMB: 250,
    diskSpaceRequiredMB: 200,
    supportedBackends: ['wasm', 'webgpu'],
    requiresFp16: false,
    license: 'Apache 2.0',
    hfUrl: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX',
    isRecommendedForBrowser: true,
    isDiagnosticDefault: true,
    isLockedForDiagnosis: false,
    notes: 'Verified ultra-lightweight browser WASM model. Small memory footprint (~172MB ONNX weights, <250MB RAM). Allocates reliably in 32-bit WASM linear memory space without buffer allocation errors.',
    requiredFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'onnx/model_q4.onnx',
    ],
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 0.5B Instruct (Locked for WASM Memory Limits)',
    family: 'Qwen',
    parameterCount: '490 Million',
    precision: 'q4',
    downloadSizeMB: 786,
    vramRequiredMB: 1200,
    diskSpaceRequiredMB: 800,
    supportedBackends: ['webgpu'],
    requiresFp16: false,
    license: 'Apache 2.0',
    hfUrl: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct',
    isRecommendedForBrowser: false,
    isDiagnosticDefault: false,
    isLockedForDiagnosis: true,
    notes: 'Locked for browser WASM due to 786MB buffer allocation limit. Requires WebGPU hardware acceleration.',
    compatibilityWarning: 'LOCKED: Requires ~786MB contiguous memory buffer allocation, exceeding 32-bit WASM limits.',
    requiredFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'added_tokens.json',
      'vocab.json',
      'merges.txt',
      'onnx/model_q4.onnx',
    ],
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 1.5B Instruct (Locked During Diagnosis)',
    family: 'Qwen',
    parameterCount: '1.54 Billion',
    precision: 'q4',
    downloadSizeMB: 1050,
    vramRequiredMB: 1800,
    diskSpaceRequiredMB: 1200,
    supportedBackends: ['webgpu'],
    requiresFp16: false,
    license: 'Apache 2.0',
    hfUrl: 'https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct',
    isRecommendedForBrowser: false,
    isDiagnosticDefault: false,
    isLockedForDiagnosis: true,
    notes: 'Locked during current diagnosis to prevent browser memory exhaustion.',
    compatibilityWarning: 'LOCKED FOR DIAGNOSIS: High memory allocation (~1.1GB download, ~1.8GB memory).',
    requiredFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'vocab.json',
      'merges.txt',
      'onnx/model_q4.onnx',
    ],
  },
  {
    id: 'webgpu/Qwen3-4B-ONNX',
    name: 'Qwen 3 4B (Locked During Diagnosis)',
    family: 'Qwen',
    parameterCount: '4.0 Billion',
    precision: 'q4f16',
    downloadSizeMB: 2400,
    vramRequiredMB: 3800,
    diskSpaceRequiredMB: 2600,
    supportedBackends: ['webgpu'],
    requiresFp16: true,
    license: 'Apache 2.0 (Qwen Open Model License)',
    hfUrl: 'https://huggingface.co/webgpu/Qwen3-4B-ONNX',
    isRecommendedForBrowser: false,
    isDiagnosticDefault: false,
    isLockedForDiagnosis: true,
    notes: 'Locked during current diagnosis. Requires dedicated hardware WebGPU with shader-f16 and >=4GB VRAM.',
    compatibilityWarning: 'LOCKED FOR DIAGNOSIS: Exceeds preview container resource limits.',
    requiredFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model_q4f16.onnx',
      'onnx/model_q4f16.onnx_data',
    ],
  },
];

export const DEFAULT_OFFLINE_MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX';

export function getModelCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return OFFLINE_MODEL_CATALOG.find(m => m.id.toLowerCase() === modelId.toLowerCase());
}
