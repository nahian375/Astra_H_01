/**
 * ASTRA Health - Neuro-Lab Cognitive Flight Readiness Battery Types
 * Scientifically validated assessment definitions for PVT, N-Back, and CPT.
 */

export type NeuroTaskType = 'PVT' | 'NBACK' | 'CPT';

export type NeuroLevelId = 1 | 2 | 3 | 4 | 5;

export interface NeuroLevelConfig {
  level: NeuroLevelId;
  name: 'Cadet' | 'Pilot' | 'Specialist' | 'Commander' | 'Deep Space';
  badge: string;
  badgeEmoji: string;
  title: string;
  description: string;
  protocolCode: string;
  trialCount: number;
  timingSummary: string;
  instructions: string[];
  scientificRationale: string;
}

export interface RawTrialData {
  trialIndex: number;
  stimulus: string;
  spatialIndex?: number; // 0-8 for 3x3 grid
  isTarget: boolean;
  userResponded: boolean;
  reactionTimeMs: number | null;
  isCorrect: boolean;
  feedbackType: 'CORRECT_HIT' | 'CORRECT_REJECTION' | 'FALSE_START' | 'LAPSE' | 'COMMISSION' | 'OMISSION' | 'VALID_REACTION';
  timestamp: number;
}

export interface PvtMetrics {
  meanReactionMs: number;
  medianReactionMs: number;
  fastest10PercentMs: number;
  lapsesCount: number; // RT > 500ms
  falseStartsCount: number; // Click before stimulus or <100ms
  validTrialsCount: number;
  totalTrials: number;
  baselineComparisonPercent: number;
  readinessRating: 'OPTIMAL' | 'NOMINAL' | 'FATIGUE_MONITOR' | 'ATTENTION_REQUIRED';
}

export interface NBackMetrics {
  accuracyPercent: number;
  correctHits: number;
  missedTargets: number;
  falseAlarms: number;
  correctRejections: number;
  meanLatencyMs: number;
  dPrime: number; // Signal detection sensitivity with Hautus log-linear correction
  totalTrials: number;
  readinessRating: 'OPTIMAL' | 'NOMINAL' | 'FATIGUE_MONITOR' | 'ATTENTION_REQUIRED';
}

export interface CptMetrics {
  accuracyPercent: number;
  commissionErrors: number; // Pressed on No-Go
  omissionErrors: number; // Failed to press on Go
  correctHits: number;
  correctRejections: number;
  meanHitRtMs: number;
  rtVariabilityMs: number; // Standard deviation of Hit RTs
  firstHalfAccuracy: number;
  secondHalfAccuracy: number;
  vigilanceDecrementPercent: number; // (1st half - 2nd half) change
  totalTrials: number;
  readinessRating: 'OPTIMAL' | 'NOMINAL' | 'FATIGUE_MONITOR' | 'ATTENTION_REQUIRED';
}

export interface NeuroLabSession {
  id: string;
  sol: number;
  timestamp: string;
  taskType: NeuroTaskType;
  level: NeuroLevelId;
  levelName: string;
  protocolCode: string;
  durationSeconds: number;
  primaryScore: number; // ms for PVT, % for N-Back & CPT
  pvtMetrics?: PvtMetrics;
  nBackMetrics?: NBackMetrics;
  cptMetrics?: CptMetrics;
  rawTrials: RawTrialData[];
  deviceContext: string;
}

export interface NeuroLabProgression {
  PVT: {
    unlockedLevel: NeuroLevelId;
    highestCompletedLevel: number;
    bestScoreByLevel: Record<number, number>; // level -> best score
    lastTestedSol?: number;
  };
  NBACK: {
    unlockedLevel: NeuroLevelId;
    highestCompletedLevel: number;
    bestScoreByLevel: Record<number, number>;
    lastTestedSol?: number;
  };
  CPT: {
    unlockedLevel: NeuroLevelId;
    highestCompletedLevel: number;
    bestScoreByLevel: Record<number, number>;
    lastTestedSol?: number;
  };
}
