/**
 * ASTRA Health - AI Router
 * Routes requests to Gemini (Online) or LocalAIProvider (Offline) or dynamically in Auto mode.
 * Guaranteed zero data loss and seamless offline fallback.
 */

import { AIResponse, HealthAIContext, AIMode, AISource, ChatHistoryMessage } from '../types/ai';
import { geminiProvider } from './geminiProvider';
import { localAIProvider } from './localAIProvider';
import { localAIManager } from './localAIManager';
import { connectivityManager } from '../services/connectivityManager';
import { offlineAIProviderAdapter } from '../offline-ai/providerAdapter';
import { offlineAIClient } from '../offline-ai/client';

export interface AskAstraParams {
  question: string;
  healthContext: HealthAIContext;
  history?: ChatHistoryMessage[];
  mode?: AIMode;
  onToken?: (token: string) => void;
}

export async function askASTRA(params: AskAstraParams): Promise<AIResponse> {
  const { question, healthContext, history, onToken } = params;
  const requestedMode = params.mode || healthContext.mode || 'AUTO';

  // 1. Force OFFLINE Mode (Zero network call, pure on-device)
  if (requestedMode === 'OFFLINE' || connectivityManager.isCommsLossSimulated()) {
    const isNewOfflineReady = await offlineAIProviderAdapter.isAvailable();
    if (isNewOfflineReady) {
      try {
        return await offlineAIProviderAdapter.generateResponse({ question, context: healthContext, history, onToken });
      } catch (err: any) {
        console.warn('[ASTRA Router] Offline neural engine failed, engaging deterministic baseline:', err?.message || err);
      }
    }
    return await localAIProvider.generateResponse({ question, context: healthContext, history, onToken });
  }

  // 2. Force ONLINE Mode
  if (requestedMode === 'ONLINE') {
    try {
      return await geminiProvider.generateResponse({ question, context: healthContext, history });
    } catch (err: any) {
      console.warn('Online mode requested but network/Gemini failed, falling back to Local ASTRA:', err.message);
      const fallbackResponse = await localAIProvider.generateResponse({ question, context: healthContext, history, onToken });
      fallbackResponse.answer = `*[Notice: Earth Uplink unavailable. Switched to Local ASTRA Core]*\n\n${fallbackResponse.answer}`;
      return fallbackResponse;
    }
  }

  // 3. AUTO Mode: Try Online first if connection and backend available, otherwise Local
  const isOnline = connectivityManager.isOnline() && !connectivityManager.isCommsLossSimulated();

  if (isOnline) {
    try {
      return await geminiProvider.generateResponse({ question, context: healthContext, history });
    } catch (err) {
      console.info('Auto mode: Cloud AI unavailable, using Local ASTRA Core');
      return await localAIProvider.generateResponse({ question, context: healthContext, history, onToken });
    }
  } else {
    return await localAIProvider.generateResponse({ question, context: healthContext, history, onToken });
  }
}

export function getActiveAISource(mode: AIMode, isOnline: boolean, commsLossSimulated: boolean): AISource {
  const isNewReady = offlineAIClient.getState().status === 'READY';
  const isNeuralReady = isNewReady || localAIManager.getModelInfo().status === 'READY';
  const offlineTag: AISource = isNeuralReady 
    ? 'OFFLINE • LOCAL ASTRA (Neural Model)' 
    : 'OFFLINE • LOCAL ASTRA (Heuristic Engine)';

  if (commsLossSimulated || mode === 'OFFLINE') {
    return offlineTag;
  }
  if (mode === 'ONLINE') {
    return isOnline ? 'ONLINE • GEMINI' : offlineTag;
  }
  // AUTO Mode
  if (isOnline) {
    return 'AUTO • GEMINI';
  }
  return isNeuralReady 
    ? 'AUTO • LOCAL ASTRA (Neural Model)' 
    : 'AUTO • LOCAL ASTRA (Heuristic Engine)';
}
