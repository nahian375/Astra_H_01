/**
 * ASTRA Health - AI & Provider Architecture Types
 */

import { HealthMeasurement, MetricBaseline, MultiMetricChange, HealthAlert, DailyCheckIn } from './health';
import { ActivityRecord, DailyActivitySummary } from './activity';
import { MissionContext } from './mission';

export type AIMode = 'ONLINE' | 'OFFLINE' | 'AUTO';

export type AISource = 
  | 'ONLINE • GEMINI' 
  | 'OFFLINE • LOCAL ASTRA'
  | 'OFFLINE • LOCAL ASTRA (Neural Model)' 
  | 'OFFLINE • LOCAL ASTRA (Heuristic Engine)' 
  | 'AUTO • GEMINI' 
  | 'AUTO • LOCAL ASTRA'
  | 'AUTO • LOCAL ASTRA (Neural Model)'
  | 'AUTO • LOCAL ASTRA (Heuristic Engine)';

export type LocalModelStatus = 
  | 'READY' 
  | 'DOWNLOADING' 
  | 'NOT_INSTALLED' 
  | 'UNSUPPORTED' 
  | 'FALLBACK_ENGINE'
  | 'GENERATING'
  | 'ERROR';

export type InferenceDevice = 'webgpu' | 'wasm';

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

export interface HealthAIContext {
  mission: MissionContext;
  currentHealth: HealthMeasurement;
  baselines: MetricBaseline[];
  recentChanges?: MultiMetricChange[];
  activeAlerts: HealthAlert[];
  recentCheckIn?: DailyCheckIn;
  recentActivities?: ActivityRecord[];
  dailyActivitySummary?: DailyActivitySummary;
  mode: AIMode;
  userQuestion: string;
  history?: ChatHistoryMessage[];
  astronautProfile?: {
    fullName: string;
    preferredName?: string;
    callSign?: string;
    role?: string;
    crewPosition?: string;
    astronautId?: string;
    agency?: string;
  };
}

export interface ActivityActionPayload {
  category: ActivityRecord['category'];
  title: string;
  details: string;
  durationMinutes?: number;
  intensity?: ActivityRecord['intensity'];
  metrics?: ActivityRecord['metrics'];
}

export interface AIResponse {
  answer: string;
  source: 'ONLINE_GEMINI' | 'OFFLINE_LOCAL_ASTRA';
  providerName: string;
  timestamp: string;
  structuredBreakdown?: {
    observation: string;
    context: string;
    possibleContributingFactors?: string[];
    suggestedNextStep: string;
    safetyNote?: string;
  };
  suggestedFollowUps?: string[];
  activityAction?: ActivityActionPayload;
  retrievedKnowledgeReferences?: string[];
  dataUsed?: string[];
  latencyMs?: number;
  isFallback?: boolean;
  uplinkNotice?: string;
  isNeuralModel?: boolean;
  inferenceDevice?: InferenceDevice;
}

export interface ModelProgressEvent {
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  device?: InferenceDevice;
  detail?: string;
}

export type WorkerIncomingMessage =
  | { type: 'INIT_MODEL'; modelId?: string; forceWasm?: boolean }
  | { type: 'GENERATE'; id: string; prompt: string; maxNewTokens?: number; temperature?: number }
  | { type: 'ABORT_GENERATION'; id: string }
  | { type: 'CHECK_CACHE'; modelId?: string }
  | { type: 'UNLOAD_MODEL' }
  | { type: 'CLEAR_CACHE' };

export type WorkerOutgoingMessage =
  | { type: 'STATUS_UPDATE'; status: LocalModelStatus; progress?: number; detail?: string; device?: InferenceDevice }
  | { type: 'PROGRESS'; data: ModelProgressEvent }
  | { type: 'TOKEN_CHUNK'; id: string; chunk: string }
  | { type: 'GENERATION_COMPLETE'; id: string; fullText: string; tokensGenerated: number; durationMs: number; device: InferenceDevice }
  | { type: 'GENERATION_ABORTED'; id: string }
  | { type: 'ERROR'; id?: string; error: string }
  | { type: 'CACHE_STATUS'; hasCachedModel: boolean; modelId: string };

export interface AIConversationMessage {
  id: string;
  sender: 'USER' | 'ASTRA';
  text: string;
  timestamp: string;
  source?: AISource;
  structuredBreakdown?: AIResponse['structuredBreakdown'];
  suggestedFollowUps?: string[];
  activityAction?: ActivityActionPayload;
  createdActivityId?: string;
  dataUsed?: string[];
}

export interface AIProvider {
  id: string;
  name: string;
  initialize(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  generateResponse(request: { question: string; context: HealthAIContext; history?: ChatHistoryMessage[] }): Promise<AIResponse>;
  generateHealthSummary(context: HealthAIContext): Promise<string>;
  explainTrend(metricKey: string, context: HealthAIContext): Promise<string>;
  summarizeChanges(changes: MultiMetricChange[], context: HealthAIContext): Promise<string>;
}

