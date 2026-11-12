/**
 * ASTRA Health - Offline Model Storage & Cache Manager
 * 
 * Manages persistent storage of downloaded ONNX weights and tokenizers using
 * the standard CacheStorage and StorageManager APIs.
 * Supports standalone asset downloading without initializing the model in memory.
 */

import { HardwareCapabilities, DownloadProgress } from './types';
import { getModelCatalogEntry } from './catalog';

const CACHE_NAME = 'transformers-cache';
const HF_BASE_URL = 'https://huggingface.co';

export class OfflineStorageManager {
  /**
   * Safely estimates storage quota and available disk space.
   */
  public static async getStorageEstimate(): Promise<HardwareCapabilities['storageEstimate']> {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const quotaMB = est.quota ? Math.round(est.quota / (1024 * 1024)) : 0;
        const usageMB = est.usage ? Math.round(est.usage / (1024 * 1024)) : 0;
        const availableMB = Math.max(0, quotaMB - usageMB);
        return { quotaMB, usageMB, availableMB };
      } catch (err) {
        console.warn('[OfflineStorageManager] Storage estimate unavailable:', err);
      }
    }
    return undefined;
  }

  /**
   * Inspects browser CacheStorage to check if a specific model's weights and tokenizer exist.
   */
  public static async verifyModelInCache(modelId: string): Promise<{
    isCached: boolean;
    cachedFiles: string[];
    totalBytes: number;
    hasOnnx: boolean;
    hasTokenizer: boolean;
  }> {
    const cacheScope: CacheStorage | undefined = typeof window !== 'undefined' ? window.caches : (typeof self !== 'undefined' ? (self as any).caches : undefined);
    if (!cacheScope) {
      return { isCached: false, cachedFiles: [], totalBytes: 0, hasOnnx: false, hasTokenizer: false };
    }

    try {
      const verification = await this.verifyModelAssetsPresent(modelId);
      return {
        isCached: verification.allPresent,
        cachedFiles: verification.verifiedUrls,
        totalBytes: verification.cachedBytes,
        hasOnnx: verification.verifiedUrls.some(u => u.endsWith('.onnx') || u.includes('.onnx_data')),
        hasTokenizer: verification.verifiedUrls.some(u => u.includes('tokenizer.json') || u.includes('tokenizer_config.json')),
      };
    } catch (err) {
      console.warn('[OfflineStorageManager] Error verifying cache:', err);
      return { isCached: false, cachedFiles: [], totalBytes: 0, hasOnnx: false, hasTokenizer: false };
    }
  }

  /**
   * Verifies that all required files for a specific model exist in CacheStorage.
   */
  public static async verifyModelAssetsPresent(modelId: string): Promise<{
    allPresent: boolean;
    missingFiles: string[];
    verifiedUrls: string[];
    cachedBytes: number;
  }> {
    const cacheScope = typeof window !== 'undefined' ? window.caches : (typeof self !== 'undefined' ? (self as any).caches : undefined);
    if (!cacheScope) {
      return { allPresent: false, missingFiles: ['Cache API unavailable'], verifiedUrls: [], cachedBytes: 0 };
    }

    const entry = getModelCatalogEntry(modelId);
    if (!entry) {
      return { allPresent: false, missingFiles: [`Unknown model: ${modelId}`], verifiedUrls: [], cachedBytes: 0 };
    }

    try {
      const cacheExists = await cacheScope.has(CACHE_NAME);
      if (!cacheExists) {
        return { allPresent: false, missingFiles: entry.requiredFiles, verifiedUrls: [], cachedBytes: 0 };
      }

      const cache = await cacheScope.open(CACHE_NAME);
      const missingFiles: string[] = [];
      const verifiedUrls: string[] = [];
      let cachedBytes = 0;

      for (const fileName of entry.requiredFiles) {
        const targetUrl = `${HF_BASE_URL}/${modelId}/resolve/main/${fileName}`;
        const match = await cache.match(targetUrl);
        if (match) {
          try {
            const blob = await match.blob();
            if (blob.size === 0) {
              missingFiles.push(`${fileName} (0 bytes/corrupted)`);
            } else {
              verifiedUrls.push(targetUrl);
              cachedBytes += blob.size;
            }
          } catch {
            missingFiles.push(`${fileName} (unreadable)`);
          }
        } else {
          // generation_config.json, merges.txt, special_tokens_map.json, added_tokens.json are optional auxiliary files
          if (
            fileName.includes('generation_config') ||
            fileName.includes('merges.txt') ||
            fileName.includes('special_tokens_map') ||
            fileName.includes('added_tokens')
          ) {
            continue;
          }
          missingFiles.push(fileName);
        }
      }

      return {
        allPresent: missingFiles.length === 0,
        missingFiles,
        verifiedUrls,
        cachedBytes,
      };
    } catch (err) {
      console.error('[OfflineStorageManager] Cache verification error:', err);
      return { allPresent: false, missingFiles: [String(err)], verifiedUrls: [], cachedBytes: 0 };
    }
  }

  /**
   * Downloads model assets directly into browser CacheStorage WITHOUT creating an ONNX session.
   * This completely separates the Downloaded state from the Initializing state.
   */
  public static async downloadModelAssetsToCache(
    modelId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; totalBytes: number; fileCount: number }> {
    if (typeof window === 'undefined' && typeof self === 'undefined') {
      throw new Error('Environment does not support Cache API');
    }

    const entry = getModelCatalogEntry(modelId);
    if (!entry) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const cacheScope = typeof window !== 'undefined' ? window.caches : (self as any).caches;
    if (!cacheScope) {
      throw new Error('CacheStorage API is not available in this context');
    }

    const cache = await cacheScope.open(CACHE_NAME);
    const files = entry.requiredFiles;
    let totalBytesLoaded = 0;
    let estimatedTotalBytes = entry.downloadSizeMB * 1024 * 1024;
    let completedFiles = 0;

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const targetUrl = `${HF_BASE_URL}/${modelId}/resolve/main/${fileName}`;

      // Check if already in cache
      const existing = await cache.match(targetUrl);
      if (existing) {
        try {
          const blob = await existing.blob();
          if (blob.size > 0) {
            totalBytesLoaded += blob.size;
            completedFiles++;
            if (onProgress) {
              const percent = Math.min(100, Math.round((totalBytesLoaded / estimatedTotalBytes) * 100));
              onProgress({
                modelId,
                file: `${fileName} (cached)`,
                loadedBytes: totalBytesLoaded,
                totalBytes: estimatedTotalBytes,
                percent,
                overallPercent: percent,
              });
            }
            continue;
          }
        } catch {
          // Re-fetch if cached entry is corrupted
        }
      }

      if (onProgress) {
        const percent = Math.min(99, Math.round((totalBytesLoaded / estimatedTotalBytes) * 100));
        onProgress({
          modelId,
          file: fileName,
          loadedBytes: totalBytesLoaded,
          totalBytes: estimatedTotalBytes,
          percent,
          overallPercent: percent,
        });
      }

      // Fetch file with streaming progress via server proxy (eliminates CORS and browser sandbox fetch blocks)
      let response: Response;
      const origin = typeof window !== 'undefined' ? window.location.origin : (typeof self !== 'undefined' ? (self as any).location.origin : '');
      const proxyUrl = `${origin}/api/model-proxy?url=${encodeURIComponent(targetUrl)}`;
      try {
        response = await fetch(proxyUrl);
        if (!response.ok) {
          console.warn(`[OfflineStorageManager] Proxy returned HTTP ${response.status} for ${fileName}, retrying direct fetch...`);
          response = await fetch(targetUrl);
        }
      } catch (proxyErr: any) {
        console.warn(`[OfflineStorageManager] Proxy fetch failed for ${fileName} (${proxyErr?.message}). Retrying direct fetch...`);
        response = await fetch(targetUrl);
      }

      if (!response.ok) {
        // Optional auxiliary files can 404 without breaking (e.g. generation_config.json)
        if (fileName.includes('generation_config') || fileName.includes('merges.txt')) {
          console.warn(`[OfflineStorageManager] Optional asset ${fileName} skipped (HTTP ${response.status})`);
          continue;
        }
        throw new Error(`Failed to download ${fileName}: HTTP ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const fileExpectedBytes = contentLength ? parseInt(contentLength, 10) : 0;
      if (fileExpectedBytes > 0 && i === files.length - 1) {
        // Calibrate estimated total bytes based on exact ONNX weight header
        estimatedTotalBytes = totalBytesLoaded + fileExpectedBytes;
      }

      // Stream chunks to track progress and store in cache
      const reader = response.body?.getReader();
      if (!reader) {
        // Fallback for runtimes without body stream
        const blob = await response.blob();
        totalBytesLoaded += blob.size;
        await cache.put(targetUrl, new Response(blob, { headers: response.headers }));
        completedFiles++;
      } else {
        const chunks: BlobPart[] = [];
        let fileBytesReceived = 0;
        let lastProgressTick = performance.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            fileBytesReceived += value.length;
            totalBytesLoaded += value.length;

            const now = performance.now();
            if (now - lastProgressTick > 150 && onProgress) {
              lastProgressTick = now;
              const percent = Math.min(99, Math.round((totalBytesLoaded / Math.max(estimatedTotalBytes, totalBytesLoaded)) * 100));
              onProgress({
                modelId,
                file: fileName,
                loadedBytes: totalBytesLoaded,
                totalBytes: Math.max(estimatedTotalBytes, totalBytesLoaded),
                percent,
                overallPercent: percent,
              });
            }
          }
        }

        // Assemble complete blob and write to CacheStorage
        const combinedBlob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
        await cache.put(targetUrl, new Response(combinedBlob, { headers: response.headers }));
        completedFiles++;
      }

      // Immediate post-write verification in CacheStorage
      const verifyWritten = await cache.match(targetUrl);
      if (!verifyWritten) {
        throw new Error(`Asset storage verification failed for ${fileName}: entry not found in CacheStorage immediately after put.`);
      }
      try {
        const verifyBlob = await verifyWritten.blob();
        if (verifyBlob.size === 0) {
          await cache.delete(targetUrl);
          throw new Error(`Asset storage verification failed for ${fileName}: stored blob is 0 bytes.`);
        }
        if (fileName.endsWith('.json')) {
          const text = await verifyBlob.text();
          JSON.parse(text);
        } else if (fileName.endsWith('.onnx') && verifyBlob.size < 1024) {
          await cache.delete(targetUrl);
          throw new Error(`Asset storage verification failed for ${fileName}: ONNX payload unexpectedly small (${verifyBlob.size} bytes).`);
        }
      } catch (readErr: any) {
        await cache.delete(targetUrl).catch(() => {});
        throw new Error(`Asset storage verification failed for ${fileName}: stored entry unreadable or corrupted (${readErr?.message}).`);
      }
    }

    // Final verification step across all required files
    const finalVerification = await this.verifyModelAssetsPresent(modelId);
    if (!finalVerification.allPresent) {
      throw new Error(`Download completed but missing assets in local cache: ${finalVerification.missingFiles.join(', ')}`);
    }

    if (onProgress) {
      onProgress({
        modelId,
        file: 'All files verified in CacheStorage',
        loadedBytes: totalBytesLoaded,
        totalBytes: totalBytesLoaded,
        percent: 100,
        overallPercent: 100,
      });
    }

    console.info(`[OfflineStorageManager] Download and verification complete for "${modelId}": ${finalVerification.verifiedUrls.length} files verified in CacheStorage.`);
    return { success: true, totalBytes: totalBytesLoaded, fileCount: completedFiles };
  }

  /**
   * Purges cached assets for a specific model or the entire transformers cache.
   */
  public static async purgeModelCache(modelId?: string): Promise<boolean> {
    const cacheScope = typeof window !== 'undefined' ? window.caches : (self as any).caches;
    if (!cacheScope) return false;

    try {
      if (!modelId) {
        return await cacheScope.delete(CACHE_NAME);
      }

      const cache = await cacheScope.open(CACHE_NAME);
      const requests = await cache.keys();
      const normalizedModelId = modelId.toLowerCase().replace('/', '_');
      const modelKeywords = modelId.toLowerCase().split(/[/_-]/).filter(k => k.length > 2);

      let deletedCount = 0;
      for (const req of requests) {
        const urlLower = req.url.toLowerCase();
        if (urlLower.includes(normalizedModelId) || urlLower.includes(modelId.toLowerCase()) || modelKeywords.some(k => urlLower.includes(k))) {
          await cache.delete(req);
          deletedCount++;
        }
      }

      console.info(`[OfflineStorageManager] Purged ${deletedCount} cache entries for model ${modelId}`);
      return true;
    } catch (err) {
      console.error('[OfflineStorageManager] Cache purge failed:', err);
      return false;
    }
  }
}
