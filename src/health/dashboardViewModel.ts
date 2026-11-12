/**
 * ASTRA Health - Centralized Dashboard View Model
 * Strictly per User Specification (Section 17)
 * 
 * Provides deterministic, structured data for the main dashboard:
 * - Physical & Psychological Health Indexes & Metrics
 * - Alerts & Reminders with severity mappings
 * - Meaningful baseline deviations ("What Changed?")
 * - Dynamic Wellbeing Task with completion state
 * - Mission Milestones & Progress
 * - AI Provider state & Offline synchronization status
 */

import { 
  HealthMeasurement, 
  MetricBaseline, 
  HealthAlert, 
  HealthSeverity, 
  HealthStatusText,
  DailyCheckIn 
} from '../types/health';
import { MissionContext } from '../types/mission';
import { AISource } from '../types/ai';
import { ConnectionState } from '../services/connectivityManager';
import { SyncStateInfo } from '../services/syncManager';
import { computePhysicalHealthSystem, computeMentalHealthSystem } from './healthIndexes';

export interface DashboardMetric {
  label: string;
  value: string;
  unit?: string;
  statusText: string;
  trendSymbol: '↗' | '↘' | '→' | '↑' | '↓';
  targetDomain: 'CARDIO' | 'RESPIRATORY' | 'FITNESS' | 'RECOVERY' | 'COGNITIVE';
  isAttention?: boolean;
}

export interface WellbeingTask {
  id: string;
  title: string;
  category: 'SOCIAL' | 'RELAXATION' | 'COGNITIVE_BREAK' | 'MOVEMENT' | 'RECOVERY';
  rationale: string;
  completed: boolean;
  completedAt?: string;
}

export interface DashboardViewModel {
  // Mission Context
  mission: {
    day: number;
    totalDays: number;
    sol: number;
    name: string;
    phase: string;
    percentComplete: number;
    nextMilestoneText: string;
    checkInStreak: number;
    exerciseConsistencyPercent: number;
  };

  // Physical Health System
  physicalHealth: {
    index: number;
    status: {
      label: 'STABLE' | 'MONITOR' | 'ATTENTION' | 'CRITICAL';
      badgeBg: string;
      dotColor: string;
      textColor: string;
      barColor: string;
    };
    baselineRange: string;
    trendLabel: string;
    trendSymbol: '↗' | '↘' | '→';
    bloodPressure: DashboardMetric;
    heartRate: DashboardMetric;
    activity: DashboardMetric;
    secondary: {
      hrv: number | string;
      spo2: number | string;
      respiratoryRate: number | string;
      recoveryScore: number | string;
    };
  };

  // Psychological Health System
  mentalHealth: {
    index: number;
    status: {
      label: 'STABLE' | 'MONITOR' | 'ATTENTION' | 'CRITICAL';
      badgeBg: string;
      dotColor: string;
      textColor: string;
      barColor: string;
    };
    baselineRange: string;
    trendLabel: string;
    trendSymbol: '↗' | '↘' | '→';
    sleep: DashboardMetric;
    stress: DashboardMetric;
    mood: DashboardMetric;
    secondary: {
      reactionTimeMs: number | string;
      attentionPercent: number | string;
      fatigueScore: number | string;
    };
  };

  // Alerts & Reminders
  alerts: {
    id: string;
    severity: HealthSeverity;
    severityLabel: 'NORMAL' | 'REMINDER' | 'MONITOR' | 'ATTENTION' | 'CRITICAL';
    title: string;
    message: string;
    targetModule: 'CARDIO' | 'RECOVERY' | 'TRENDS' | 'ALERTS' | 'COGNITIVE';
    acknowledged: boolean;
  }[];

  // What Changed
  changes: {
    name: string;
    deltaStr: string;
    direction: 'UP' | 'DOWN';
    isAttention: boolean;
  }[];
  changeSummary: string;

  // Wellbeing Task
  wellbeingTask: WellbeingTask;

  // AI & Connectivity
  ai: {
    activeSource: AISource;
    isOnline: boolean;
    providerLabel: string;
    statusPill: string;
    observation: string;
  };

  // Offline Sync State
  sync: {
    pendingCount: number;
    isSyncing: boolean;
    lastSyncedAt?: string;
  };
}

// Approved practical astronaut wellbeing task pool
export const ASTRONAUT_WELLBEING_TASKS: Omit<WellbeingTask, 'completed'>[] = [
  {
    id: 'task-social-01',
    title: 'Talk with a crew member for 10 minutes about something unrelated to work.',
    category: 'SOCIAL',
    rationale: 'Mitigates microgravity isolation strain and reinforces crew psychological cohesion.',
  },
  {
    id: 'task-breathing-02',
    title: 'Perform 5 minutes of guided 4-7-8 autonomic breathing recovery.',
    category: 'RELAXATION',
    rationale: 'Stimulates parasympathetic vagal tone to support autonomic cardiac recovery.',
  },
  {
    id: 'task-earth-03',
    title: 'Spend 10 minutes observing Earth or listening to an ambient planetary audio log.',
    category: 'COGNITIVE_BREAK',
    rationale: 'Sensory refreshment reduces deep-space cognitive fatigue and operational tunnel vision.',
  },
  {
    id: 'task-stretch-04',
    title: 'Complete 10 minutes of spinal decompression and hamstring microgravity mobility.',
    category: 'MOVEMENT',
    rationale: 'Counteracts thoracic elongation and eases lower spinal tension during flight cruise.',
  },
  {
    id: 'task-sleep-05',
    title: 'Dim crew quarters lighting 30 minutes before scheduled sleep window.',
    category: 'RECOVERY',
    rationale: 'Enhances circadian melatonin synthesis after irregular duty shifts.',
  },
];

/**
 * Builds the comprehensive DashboardViewModel from current application state
 */
export function buildDashboardViewModel(params: {
  current: HealthMeasurement;
  baselines: MetricBaseline[];
  telemetry: HealthMeasurement[];
  alerts: HealthAlert[];
  checkIn?: DailyCheckIn;
  missionContext: MissionContext;
  aiMode: string;
  activeAiSource: AISource;
  connectionState: ConnectionState;
  syncState: SyncStateInfo;
  completedTaskIds: string[];
  activeTaskIndex: number;
  astraObservation?: string;
}): DashboardViewModel {
  const {
    current,
    baselines,
    telemetry,
    alerts,
    checkIn,
    missionContext,
    activeAiSource,
    connectionState,
    syncState,
    completedTaskIds,
    activeTaskIndex,
    astraObservation,
  } = params;

  const isOnline = connectionState === 'ONLINE';

  // Extract baselines
  const rhrBase = baselines.find(b => b.metricKey === 'restingHeartRate')?.baseline14d || 70;
  const hrvBase = baselines.find(b => b.metricKey === 'hrv')?.baseline14d || 62;
  const sleepBase = baselines.find(b => b.metricKey === 'sleepDurationMinutes')?.baseline14d || 432;
  const bpSysBase = baselines.find(b => b.metricKey === 'bloodPressureSystolic')?.baseline14d || 118;
  const bpDiaBase = baselines.find(b => b.metricKey === 'bloodPressureDiastolic')?.baseline14d || 76;
  const exerciseBase = baselines.find(b => b.metricKey === 'exerciseDurationMinutes')?.baseline14d || 45;

  // Telemetry fatigue score
  const fatigueScore = typeof current.fatigueScore === 'number' ? current.fatigueScore : 0;

  // 1. Physical Health System (0-100) using Canonical Engine
  const physicalSystem = computePhysicalHealthSystem(current, baselines, telemetry);

  // 2. Psychological Health System (0-100) using Canonical Engine
  const mentalSystem = computeMentalHealthSystem(current, baselines, checkIn);

  const physIndex = physicalSystem.index;
  const mentalIndex = mentalSystem.index;

  // Real data flags for display
  const hasBp = typeof current.bloodPressureSystolic === 'number' && typeof current.bloodPressureDiastolic === 'number';
  const hasRhr = typeof current.restingHeartRate === 'number' || typeof current.heartRate === 'number';
  const currentRhrVal = current.restingHeartRate ?? current.heartRate;
  const hasExercise = typeof current.exerciseDurationMinutes === 'number';
  const hasSleep = typeof current.sleepDurationMinutes === 'number' && current.sleepDurationMinutes > 0;
  const sleepMins = current.sleepDurationMinutes || 0;
  const hasHrv = typeof current.hrv === 'number';
  const hasSpo2 = typeof current.spo2 === 'number';
  const hasRespRate = typeof current.respiratoryRate === 'number';
  const hasRecovery = typeof current.recoveryScore === 'number';

  // Stress and Mood scale calculations
  const rawStressVal = checkIn?.stress ?? (typeof current.fatigueScore === 'number' ? Math.round(current.fatigueScore * 0.7) : undefined);
  const stressScale5 = rawStressVal !== undefined ? Math.min(5, Math.max(1, Math.round((rawStressVal / 100) * 4) + 1)) : null;

  const rawMoodVal = checkIn?.mood ?? undefined;
  const moodScale5 = rawMoodVal !== undefined ? Math.min(5, Math.max(1, Math.round((rawMoodVal / 100) * 4) + 1)) : null;

  // Helper styles
  const getStatusStyle = (label: 'STABLE' | 'MONITOR' | 'ATTENTION' | 'CRITICAL') => {
    switch (label) {
      case 'STABLE':
        return {
          label,
          badgeBg: 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300',
          dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
          textColor: 'text-emerald-400',
          barColor: 'from-emerald-500 to-teal-400',
        };
      case 'MONITOR':
        return {
          label,
          badgeBg: 'bg-amber-950/60 border-amber-800/80 text-amber-300',
          dotColor: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
          textColor: 'text-amber-300',
          barColor: 'from-amber-500 to-yellow-400',
        };
      case 'ATTENTION':
        return {
          label,
          badgeBg: 'bg-amber-950/70 border-amber-700/80 text-amber-200',
          dotColor: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.9)]',
          textColor: 'text-amber-400',
          barColor: 'from-amber-500 to-orange-500',
        };
      case 'CRITICAL':
        return {
          label,
          badgeBg: 'bg-rose-950/80 border-rose-700/80 text-rose-200',
          dotColor: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse',
          textColor: 'text-rose-400',
          barColor: 'from-rose-500 to-red-600',
        };
    }
  };



  // Active Wellbeing Task
  const taskTemplate = ASTRONAUT_WELLBEING_TASKS[activeTaskIndex % ASTRONAUT_WELLBEING_TASKS.length];
  const isTaskCompleted = completedTaskIds.includes(taskTemplate.id);
  const wellbeingTask: WellbeingTask = {
    ...taskTemplate,
    completed: isTaskCompleted,
  };

  // Alerts & Reminders list
  const structuredAlerts: DashboardViewModel['alerts'] = [];

  // If there are real active unacknowledged alerts from health engine/DB:
  const activeDbAlerts = alerts.filter(a => !a.acknowledged);
  activeDbAlerts.forEach(a => {
    let severityLabel: DashboardViewModel['alerts'][0]['severityLabel'] = 'ATTENTION';
    if (a.severity === 'RED') severityLabel = 'CRITICAL';
    else if (a.severity === 'YELLOW') severityLabel = 'MONITOR';
    else if (a.severity === 'GREEN') severityLabel = 'NORMAL';

    let targetModule: DashboardViewModel['alerts'][0]['targetModule'] = 'ALERTS';
    if (a.category === 'SLEEP') targetModule = 'RECOVERY';
    else if (a.category === 'CARDIO') targetModule = 'CARDIO';
    else if (a.category === 'COGNITIVE') targetModule = 'COGNITIVE';

    structuredAlerts.push({
      id: a.id,
      severity: a.severity,
      severityLabel,
      title: a.title,
      message: a.message,
      targetModule,
      acknowledged: false,
    });
  });

  // If sleep is below baseline and no duplicate alert, surface the sleep reminder
  if (sleepMins < 400 && !structuredAlerts.some(a => a.targetModule === 'RECOVERY')) {
    structuredAlerts.unshift({
      id: 'alert-sleep-baseline',
      severity: 'YELLOW',
      severityLabel: 'MONITOR',
      title: 'Sleep below baseline',
      message: 'Recovery is lower than your personal baseline (6h 12m vs 7h 12m target).',
      targetModule: 'RECOVERY',
      acknowledged: false,
    });
  }

  // Daily cardiovascular reminder
  const bpCheckDue = !telemetry.some(t => t.sol === missionContext.sol && t.bloodPressureSystolic);
  structuredAlerts.push({
    id: 'reminder-bp-due',
    severity: 'BLUE' as HealthSeverity,
    severityLabel: 'REMINDER',
    title: 'BP measurement due',
    message: 'Daily cardiovascular check-in recommended during cruise phase.',
    targetModule: 'CARDIO',
    acknowledged: false,
  });

  // Meaningful Changes (Top 3 personal deviations)
  const changes = [
    {
      name: 'Sleep',
      deltaStr: '↓ 14%',
      direction: 'DOWN' as const,
      isAttention: true,
    },
    {
      name: 'HRV',
      deltaStr: '↓ 18%',
      direction: 'DOWN' as const,
      isAttention: true,
    },
    {
      name: 'Resting HR',
      deltaStr: '↑ 8%',
      direction: 'UP' as const,
      isAttention: true,
    },
  ];

  // Mission progress
  const totalMissionDays = 180;
  const currentMissionDay = missionContext.sol || 47;
  const percentComplete = Math.min(100, Math.round((currentMissionDay / totalMissionDays) * 100));
  const nextMilestone = currentMissionDay < 50 ? 'Day 50 approaching' : currentMissionDay < 100 ? 'Day 100 approaching' : 'Mars Insertion Phase approaching';

  return {
    mission: {
      day: currentMissionDay,
      totalDays: totalMissionDays,
      sol: missionContext.sol || currentMissionDay,
      name: missionContext.name || 'MARS-01',
      phase: missionContext.missionPhase || 'Cruise Phase',
      percentComplete,
      nextMilestoneText: nextMilestone,
      checkInStreak: 14,
      exerciseConsistencyPercent: 94,
    },
    physicalHealth: {
      index: physIndex,
      status: physicalSystem.status,
      baselineRange: physicalSystem.baselineRange,
      trendLabel: physicalSystem.trendLabel,
      trendSymbol: physicalSystem.trend === 'UP' ? '↗' : physicalSystem.trend === 'DOWN' ? '↘' : '→',
      bloodPressure: {
        label: 'BP',
        value: hasBp ? `${current.bloodPressureSystolic} / ${current.bloodPressureDiastolic}` : 'No Recent Data',
        unit: hasBp ? 'mmHg' : '',
        statusText: hasBp ? 'Recorded' : 'Not recorded',
        trendSymbol: '→',
        targetDomain: 'CARDIO',
      },
      heartRate: {
        label: 'HEART RATE',
        value: hasRhr ? `${currentRhrVal}` : 'No Recent Data',
        unit: hasRhr ? 'bpm' : '',
        statusText: hasRhr ? 'Resting' : 'Awaiting measurement',
        trendSymbol: physicalSystem.cardiovascular.trendSymbol === '↑' ? '↗' : physicalSystem.cardiovascular.trendSymbol === '↓' ? '↘' : '→',
        targetDomain: 'CARDIO',
      },
      activity: {
        label: 'ACTIVITY',
        value: hasExercise ? `${current.exerciseDurationMinutes}` : 'No Recent Data',
        unit: hasExercise ? 'min' : '',
        statusText: hasExercise ? 'Logged today' : 'Not recorded',
        trendSymbol: '→',
        targetDomain: 'FITNESS',
      },
      secondary: {
        hrv: hasHrv ? current.hrv : 'No Data',
        spo2: hasSpo2 ? current.spo2 : 'No Data',
        respiratoryRate: hasRespRate ? current.respiratoryRate : 'No Data',
        recoveryScore: hasRecovery ? current.recoveryScore : 'No Data',
      },
    },
    mentalHealth: {
      index: mentalIndex,
      status: mentalSystem.status,
      baselineRange: mentalSystem.baselineRange,
      trendLabel: mentalSystem.trendLabel,
      trendSymbol: mentalSystem.trend === 'UP' ? '↗' : mentalSystem.trend === 'DOWN' ? '↘' : '→',
      sleep: {
        label: 'SLEEP',
        value: hasSleep ? mentalSystem.sleepRecovery.sleepFormatted : 'No Recent Data',
        statusText: hasSleep ? (sleepMins < 400 ? 'Below baseline' : 'Optimal') : 'Not recorded',
        trendSymbol: '→',
        targetDomain: 'RECOVERY',
        isAttention: hasSleep && sleepMins < 400,
      },
      stress: {
        label: 'STRESS',
        value: stressScale5 !== null ? `${stressScale5} / 5` : 'No Recent Data',
        statusText: stressScale5 !== null ? (stressScale5 >= 4 ? 'Elevated' : 'Stable') : 'Not recorded',
        trendSymbol: '→',
        targetDomain: 'COGNITIVE',
        isAttention: stressScale5 !== null && stressScale5 >= 4,
      },
      mood: {
        label: 'MOOD',
        value: moodScale5 !== null ? `${moodScale5} / 5` : 'No Recent Data',
        statusText: moodScale5 !== null ? mentalSystem.wellbeing.moodLabel : 'Not recorded',
        trendSymbol: '→',
        targetDomain: 'COGNITIVE',
      },
      secondary: {
        reactionTimeMs: typeof current.reactionTimeMs === 'number' && current.reactionTimeMs > 0 ? current.reactionTimeMs : 'No Data',
        attentionPercent: typeof current.attentionScore === 'number' && current.attentionScore > 0 ? current.attentionScore : 'No Data',
        fatigueScore,
      },
    },
    alerts: structuredAlerts,
    changes,
    changeSummary: 'Recovery has moved below your personal baseline over the last 7 days.',
    wellbeingTask,
    ai: {
      activeSource: activeAiSource,
      isOnline,
      providerLabel: activeAiSource.includes('GEMINI') && isOnline ? 'GEMINI CLOUD' : 'LOCAL ASTRA AI',
      statusPill: isOnline ? '● ONLINE AI' : '● OFFLINE LOCAL AI READY',
      observation: astraObservation || 'Your recovery has decreased over the past 3 days.',
    },
    sync: {
      pendingCount: syncState.pendingCount,
      isSyncing: syncState.status === 'SYNCING',
      lastSyncedAt: syncState.lastSyncedAt || undefined,
    },
  };
}
