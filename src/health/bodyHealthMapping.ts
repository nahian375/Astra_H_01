/**
 * ASTRA Health - Unified Data-Driven Body Mapping
 * 
 * CRITICAL DATA-INTEGRITY RULES:
 * 1. ONLY maps physiological domains with actual input fields or stored measurements in ASTRA Health:
 *    - WHOLE_BODY (Physical & Mental Composite Health Index)
 *    - BRAIN (Sleep Architecture, Mood, Stress, Energy, Fatigue, PVT, N-Back, CPT)
 *    - HEART (Heart Rate, Resting HR, HRV, Blood Pressure)
 *    - LUNGS (SpO₂, Respiratory Rate)
 *    - MUSCLES (Exercise Duration, Resistance Load, Aerobic Output)
 *    - THERMOREGULATION_HYDRATION (Core Temperature, Hydration Index)
 *    - RADIATION (Daily Dose Equivalent, Cumulative Exposure)
 * 2. NO Unsupported Organs: Unsupported organs (e.g. Liver, Kidneys, Stomach, Eyes) are excluded because ASTRA Health does not collect specific telemetry for them.
 * 3. NO Demo Data: Missing metrics are displayed as "No Recent Data" without fabricating values.
 */

import { HealthMeasurement, MetricBaseline, DailyCheckIn, RadiationMeasurement } from '../types/health';
import { MedicalReportRecord, ExtractedLabResult } from '../types/medicalReport';
import { computePhysicalHealthSystem, computeMentalHealthSystem, HealthStatusInfo } from './healthIndexes';

export type AnatomicalRegionId = 
  | 'WHOLE_BODY'
  | 'BRAIN'
  | 'HEART'
  | 'LUNGS'
  | 'MUSCLES'
  | 'THERMOREGULATION_HYDRATION'
  | 'RADIATION';

export interface AnatomicalMetricDetail {
  id: string;
  name: string;
  valueDisplay: string;
  unit: string;
  baselineDisplay: string;
  deviationPercent?: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  status: 'NORMAL' | 'MONITOR' | 'ATTENTION' | 'CRITICAL' | 'NO_DATA';
  explanation: string;
  source: string;
  hasData: boolean;
}

export interface AnatomicalRegionData {
  id: AnatomicalRegionId;
  title: string;
  subtitle: string;
  systemCategory: 'CARDIO' | 'RESPIRATORY' | 'RECOVERY' | 'FITNESS' | 'COGNITIVE' | 'RADIATION' | 'OVERVIEW';
  status: HealthStatusInfo;
  healthIndexScore: number | null; // null if no data exists
  primaryMetricSummary: string;
  description: string;
  metrics: AnatomicalMetricDetail[];
  lastUpdated: string;
  source: string;
  targetDomain: 'CARDIO' | 'RESPIRATORY' | 'RECOVERY' | 'FITNESS' | 'COGNITIVE' | 'RADIATION' | 'ALL';
  hasData: boolean;
}

export function getBodyHealthData(params: {
  currentHealth?: HealthMeasurement;
  baselines?: MetricBaseline[];
  recentCheckIn?: DailyCheckIn;
  radiationMeasurements?: RadiationMeasurement[];
  medicalReports?: MedicalReportRecord[];
  laboratoryResults?: ExtractedLabResult[];
}): Record<AnatomicalRegionId, AnatomicalRegionData> {
  const { currentHealth, baselines = [], recentCheckIn } = params;

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'No Recent Timestamp';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return 'No Recent Timestamp';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';
    } catch {
      return 'No Recent Timestamp';
    }
  };

  const timestamp = formatTimestamp(currentHealth?.timestamp);

  const getBase = (key: string) => baselines.find(b => b.metricKey === key);

  const rhrBase = getBase('restingHeartRate');
  const hrvBase = getBase('hrv');
  const spo2Base = getBase('spo2');
  const respBase = getBase('respiratoryRate');
  const sleepBase = getBase('sleepDurationMinutes');
  const exerciseBase = getBase('exerciseDurationMinutes');
  const radBase = getBase('dailyRadiation_uSv');
  const tempBase = getBase('coreTemperature');
  const hydBase = getBase('hydrationIndex');

  const defaultStatusInfo: HealthStatusInfo = {
    label: 'STABLE',
    textColor: 'text-slate-400',
    badgeBg: 'bg-slate-900 border-slate-800 text-slate-400',
    dotColor: 'bg-slate-500',
    barColor: 'from-slate-600 to-slate-700',
  };

  // 1. WHOLE BODY OVERVIEW
  const physicalSystem = currentHealth ? computePhysicalHealthSystem(currentHealth, baselines) : null;
  const mentalSystem = currentHealth ? computeMentalHealthSystem(currentHealth, baselines, recentCheckIn) : null;

  const wholeBodyHasData = !!currentHealth;
  const wholeBody: AnatomicalRegionData = {
    id: 'WHOLE_BODY',
    title: 'WHOLE BODY OVERVIEW',
    subtitle: 'Composite Physiological & Psychological Index',
    systemCategory: 'OVERVIEW',
    status: physicalSystem ? physicalSystem.status : defaultStatusInfo,
    healthIndexScore: (physicalSystem && mentalSystem) ? Math.round((physicalSystem.index + mentalSystem.index) / 2) : null,
    primaryMetricSummary: (physicalSystem && mentalSystem) 
      ? `Physical Index: ${physicalSystem.index}/100 • Mental Index: ${mentalSystem.index}/100` 
      : 'No Telemetry Recorded',
    description: 'Surfaces overall physical and neural health status calculated directly from stored ASTRA telemetry.',
    lastUpdated: timestamp,
    source: 'Health Engine Composite',
    targetDomain: 'ALL',
    hasData: wholeBodyHasData,
    metrics: [
      {
        id: 'physical_index',
        name: 'Physical Health Index',
        valueDisplay: physicalSystem ? `${physicalSystem.index}` : 'No Data',
        unit: physicalSystem ? '/ 100' : '',
        baselineDisplay: physicalSystem?.baselineRange || 'No Baseline',
        trend: physicalSystem?.trend || 'STABLE',
        status: physicalSystem ? (physicalSystem.status.label === 'STABLE' ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: physicalSystem?.supportingText || 'No stored physical telemetry available to compute index.',
        source: 'Physical Health Engine',
        hasData: !!physicalSystem,
      },
      {
        id: 'mental_index',
        name: 'Neural & Mental Health Index',
        valueDisplay: mentalSystem ? `${mentalSystem.index}` : 'No Data',
        unit: mentalSystem ? '/ 100' : '',
        baselineDisplay: mentalSystem?.baselineRange || 'No Baseline',
        trend: mentalSystem?.trend || 'STABLE',
        status: mentalSystem ? (mentalSystem.status.label === 'STABLE' ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: mentalSystem?.supportingText || 'No stored psychological telemetry available to compute index.',
        source: 'Psychological Surveillance',
        hasData: !!mentalSystem,
      },
      {
        id: 'recovery_score',
        name: 'Physical Recovery Score',
        valueDisplay: typeof currentHealth?.recoveryScore === 'number' ? `${currentHealth.recoveryScore}` : 'No Data',
        unit: typeof currentHealth?.recoveryScore === 'number' ? '%' : '',
        baselineDisplay: '75 – 95%',
        deviationPercent: typeof currentHealth?.recoveryScore === 'number' ? Math.round(((currentHealth.recoveryScore - 85) / 85) * 100) : undefined,
        trend: (currentHealth?.recoveryScore ?? 0) >= 80 ? 'UP' : 'DOWN',
        status: typeof currentHealth?.recoveryScore === 'number' ? (currentHealth.recoveryScore >= 80 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.recoveryScore === 'number' ? 'Derived from HRV rMSSD, rest duration, and sleep consistency.' : 'No recovery measurement recorded.',
        source: 'Circadian Engine',
        hasData: typeof currentHealth?.recoveryScore === 'number',
      },
    ],
  };

  // 2. BRAIN & NEURAL SYSTEM
  const hasBrainData = !!(
    currentHealth?.sleepDurationMinutes !== undefined ||
    currentHealth?.reactionTimeMs !== undefined ||
    currentHealth?.memoryScore !== undefined ||
    currentHealth?.attentionScore !== undefined ||
    recentCheckIn?.mood !== undefined ||
    recentCheckIn?.stress !== undefined ||
    recentCheckIn?.fatigue !== undefined
  );

  const brain: AnatomicalRegionData = {
    id: 'BRAIN',
    title: 'BRAIN & CENTRAL NERVOUS SYSTEM',
    subtitle: 'Neuro-Cognitive Readiness & Circadian Health',
    systemCategory: 'COGNITIVE',
    status: mentalSystem ? mentalSystem.status : defaultStatusInfo,
    healthIndexScore: mentalSystem ? mentalSystem.index : null,
    primaryMetricSummary: mentalSystem 
      ? `Sleep: ${mentalSystem.sleepRecovery.sleepFormatted} • Reaction: ${mentalSystem.cognitive.reactionTimeMs > 0 ? mentalSystem.cognitive.reactionTimeMs + 'ms' : 'No Data'}`
      : 'No Neuro-Cognitive Data',
    description: 'Monitors sleep rest architecture, operational stress, mood, and cognitive performance tests (PVT/N-Back/CPT).',
    lastUpdated: timestamp,
    source: 'Neuro Lab & Daily Check-In',
    targetDomain: 'COGNITIVE',
    hasData: hasBrainData,
    metrics: [
      {
        id: 'reaction_time',
        name: 'Psychomotor Reaction Latency (PVT)',
        valueDisplay: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0 ? `${currentHealth.reactionTimeMs}` : 'No Recent Data',
        unit: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0 ? 'ms' : '',
        baselineDisplay: '240 – 260 ms',
        deviationPercent: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0 ? Math.round(((currentHealth.reactionTimeMs - 248) / 248) * 100) : undefined,
        trend: (currentHealth?.reactionTimeMs ?? 250) <= 250 ? 'STABLE' : 'DOWN',
        status: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0 ? (currentHealth.reactionTimeMs <= 260 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0 ? 'NASA Psychomotor Vigilance Task (PVT) response speed.' : 'No recent PVT reaction benchmark completed.',
        source: 'Neuro Lab (PVT)',
        hasData: typeof currentHealth?.reactionTimeMs === 'number' && currentHealth.reactionTimeMs > 0,
      },
      {
        id: 'working_memory',
        name: 'Spatial N-Back Working Memory',
        valueDisplay: typeof currentHealth?.memoryScore === 'number' && currentHealth.memoryScore > 0 ? `${currentHealth.memoryScore}` : 'No Recent Data',
        unit: typeof currentHealth?.memoryScore === 'number' && currentHealth.memoryScore > 0 ? '%' : '',
        baselineDisplay: '85 – 95%',
        trend: (currentHealth?.memoryScore ?? 80) >= 80 ? 'UP' : 'DOWN',
        status: typeof currentHealth?.memoryScore === 'number' && currentHealth.memoryScore > 0 ? (currentHealth.memoryScore >= 80 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.memoryScore === 'number' && currentHealth.memoryScore > 0 ? 'Sequence recall accuracy and short-term working memory capacity.' : 'No recent Spatial N-Back recall benchmark recorded.',
        source: 'Neuro Lab (N-Back)',
        hasData: typeof currentHealth?.memoryScore === 'number' && currentHealth.memoryScore > 0,
      },
      {
        id: 'attention_score',
        name: 'Continuous Attention (CPT)',
        valueDisplay: typeof currentHealth?.attentionScore === 'number' && currentHealth.attentionScore > 0 ? `${currentHealth.attentionScore}` : 'No Recent Data',
        unit: typeof currentHealth?.attentionScore === 'number' && currentHealth.attentionScore > 0 ? '%' : '',
        baselineDisplay: '80 – 92%',
        trend: (currentHealth?.attentionScore ?? 80) >= 78 ? 'STABLE' : 'DOWN',
        status: typeof currentHealth?.attentionScore === 'number' && currentHealth.attentionScore > 0 ? (currentHealth.attentionScore >= 78 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.attentionScore === 'number' && currentHealth.attentionScore > 0 ? 'Sustained target discrimination and impulse control.' : 'No recent CPT attention benchmark recorded.',
        source: 'Neuro Lab (CPT)',
        hasData: typeof currentHealth?.attentionScore === 'number' && currentHealth.attentionScore > 0,
      },
      {
        id: 'sleep_duration',
        name: 'Sleep Rest Duration',
        valueDisplay: typeof currentHealth?.sleepDurationMinutes === 'number' && currentHealth.sleepDurationMinutes > 0 
          ? `${Math.floor(currentHealth.sleepDurationMinutes / 60)}h ${currentHealth.sleepDurationMinutes % 60}m` 
          : 'No Recent Data',
        unit: typeof currentHealth?.sleepDurationMinutes === 'number' && currentHealth.sleepDurationMinutes > 0 ? '' : '',
        baselineDisplay: sleepBase ? `${(sleepBase.baseline14d / 60).toFixed(1)}h` : '8.0h Target',
        deviationPercent: sleepBase ? sleepBase.deviationPercent : undefined,
        trend: sleepBase?.trend || 'STABLE',
        status: typeof currentHealth?.sleepDurationMinutes === 'number' && currentHealth.sleepDurationMinutes > 0 ? (currentHealth.sleepDurationMinutes >= 420 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.sleepDurationMinutes === 'number' && currentHealth.sleepDurationMinutes > 0 ? 'Total logged rest hours vs 8.0h NASA baseline.' : 'No recent sleep duration logged in Daily Check-In.',
        source: 'Daily Check-In',
        hasData: typeof currentHealth?.sleepDurationMinutes === 'number' && currentHealth.sleepDurationMinutes > 0,
      },
    ],
  };

  // 3. HEART & CARDIOVASCULAR
  const hasHeartData = !!(
    currentHealth?.heartRate !== undefined ||
    currentHealth?.restingHeartRate !== undefined ||
    currentHealth?.hrv !== undefined ||
    currentHealth?.bloodPressureSystolic !== undefined
  );

  const heart: AnatomicalRegionData = {
    id: 'HEART',
    title: 'HEART & CARDIOVASCULAR SYSTEM',
    subtitle: 'Myocardial Contractility & Autonomic Tone',
    systemCategory: 'CARDIO',
    status: physicalSystem ? physicalSystem.status : defaultStatusInfo,
    healthIndexScore: physicalSystem ? physicalSystem.index : null,
    primaryMetricSummary: hasHeartData 
      ? `HR: ${currentHealth?.heartRate ?? 'No Data'} bpm • HRV: ${currentHealth?.hrv ?? 'No Data'} ms • BP: ${currentHealth?.bloodPressureSystolic ?? '--'}/${currentHealth?.bloodPressureDiastolic ?? '--'}` 
      : 'No Cardiovascular Data',
    description: 'Measures heart rate, basal pulse, HRV RMSSD autonomic tone, and systemic arterial blood pressure.',
    lastUpdated: timestamp,
    source: 'ECG & Wearable Telemetry',
    targetDomain: 'CARDIO',
    hasData: hasHeartData,
    metrics: [
      {
        id: 'heart_rate',
        name: 'Active Heart Rate',
        valueDisplay: typeof currentHealth?.heartRate === 'number' && currentHealth.heartRate > 0 ? `${currentHealth.heartRate}` : 'No Recent Data',
        unit: typeof currentHealth?.heartRate === 'number' && currentHealth.heartRate > 0 ? 'bpm' : '',
        baselineDisplay: rhrBase ? `${rhrBase.baseline14d} bpm` : '60 – 80 bpm',
        deviationPercent: rhrBase ? rhrBase.deviationPercent : undefined,
        trend: rhrBase?.trend || 'STABLE',
        status: typeof currentHealth?.heartRate === 'number' && currentHealth.heartRate > 0 ? (currentHealth.heartRate >= 50 && currentHealth.heartRate <= 100 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.heartRate === 'number' && currentHealth.heartRate > 0 ? 'Current active heart rate during shift operations.' : 'No active pulse telemetry recorded.',
        source: 'ECG Sensor',
        hasData: typeof currentHealth?.heartRate === 'number' && currentHealth.heartRate > 0,
      },
      {
        id: 'resting_hr',
        name: 'Resting Heart Rate',
        valueDisplay: typeof currentHealth?.restingHeartRate === 'number' && currentHealth.restingHeartRate > 0 ? `${currentHealth.restingHeartRate}` : 'No Recent Data',
        unit: typeof currentHealth?.restingHeartRate === 'number' && currentHealth.restingHeartRate > 0 ? 'bpm' : '',
        baselineDisplay: '55 – 68 bpm',
        trend: 'STABLE',
        status: typeof currentHealth?.restingHeartRate === 'number' && currentHealth.restingHeartRate > 0 ? (currentHealth.restingHeartRate <= 75 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.restingHeartRate === 'number' && currentHealth.restingHeartRate > 0 ? 'Basal heart rate recorded during non-exertion states.' : 'No basal pulse baseline recorded.',
        source: 'Basal Sensor',
        hasData: typeof currentHealth?.restingHeartRate === 'number' && currentHealth.restingHeartRate > 0,
      },
      {
        id: 'hrv',
        name: 'Heart Rate Variability (HRV rMSSD)',
        valueDisplay: typeof currentHealth?.hrv === 'number' && currentHealth.hrv > 0 ? `${currentHealth.hrv}` : 'No Recent Data',
        unit: typeof currentHealth?.hrv === 'number' && currentHealth.hrv > 0 ? 'ms' : '',
        baselineDisplay: hrvBase ? `${hrvBase.baseline14d} ms` : '40 – 70 ms',
        deviationPercent: hrvBase ? hrvBase.deviationPercent : undefined,
        trend: hrvBase?.trend || 'STABLE',
        status: typeof currentHealth?.hrv === 'number' && currentHealth.hrv > 0 ? (currentHealth.hrv >= 35 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.hrv === 'number' && currentHealth.hrv > 0 ? 'Parasympathetic autonomic nervous system recovery tone.' : 'No rMSSD HRV telemetry recorded.',
        source: 'ECG Telemetry',
        hasData: typeof currentHealth?.hrv === 'number' && currentHealth.hrv > 0,
      },
      {
        id: 'blood_pressure',
        name: 'Blood Pressure',
        valueDisplay: (typeof currentHealth?.bloodPressureSystolic === 'number' && currentHealth.bloodPressureSystolic > 0) 
          ? `${currentHealth.bloodPressureSystolic} / ${currentHealth.bloodPressureDiastolic}` 
          : 'No Recent Data',
        unit: (typeof currentHealth?.bloodPressureSystolic === 'number' && currentHealth.bloodPressureSystolic > 0) ? 'mmHg' : '',
        baselineDisplay: '120/80 mmHg',
        trend: 'STABLE',
        status: (typeof currentHealth?.bloodPressureSystolic === 'number' && currentHealth.bloodPressureSystolic > 0) ? (currentHealth.bloodPressureSystolic <= 135 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: (typeof currentHealth?.bloodPressureSystolic === 'number' && currentHealth.bloodPressureSystolic > 0) ? 'Systolic/Diastolic blood pressure cuff measurement.' : 'No blood pressure reading recorded.',
        source: 'Cardiovascular Cuff',
        hasData: (typeof currentHealth?.bloodPressureSystolic === 'number' && currentHealth.bloodPressureSystolic > 0),
      },
    ],
  };

  // 4. LUNGS & RESPIRATORY SYSTEM
  const hasLungsData = !!(
    currentHealth?.spo2 !== undefined ||
    currentHealth?.respiratoryRate !== undefined
  );

  const lungs: AnatomicalRegionData = {
    id: 'LUNGS',
    title: 'LUNGS & RESPIRATORY TRACT',
    subtitle: 'Pulmonary Ventilation & Gas Exchange',
    systemCategory: 'RESPIRATORY',
    status: physicalSystem ? physicalSystem.status : defaultStatusInfo,
    healthIndexScore: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0 ? Math.min(100, Math.round(currentHealth.spo2 * 0.95 + 5)) : null,
    primaryMetricSummary: hasLungsData 
      ? `SpO₂: ${currentHealth?.spo2 ?? 'No Data'}% • Resp Rate: ${currentHealth?.respiratoryRate ?? 'No Data'} br/m` 
      : 'No Respiratory Data',
    description: 'Tracks peripheral oxygen saturation (SpO₂) and minute respiratory rate.',
    lastUpdated: timestamp,
    source: 'Pulse Oximeter & Bio-Harness',
    targetDomain: 'RESPIRATORY',
    hasData: hasLungsData,
    metrics: [
      {
        id: 'spo2',
        name: 'Blood Oxygen Saturation (SpO₂)',
        valueDisplay: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0 ? `${currentHealth.spo2}` : 'No Recent Data',
        unit: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0 ? '%' : '',
        baselineDisplay: spo2Base ? `${spo2Base.baseline14d}%` : '96 – 99%',
        deviationPercent: spo2Base ? spo2Base.deviationPercent : undefined,
        trend: spo2Base?.trend || 'STABLE',
        status: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0 ? (currentHealth.spo2 >= 95 ? 'NORMAL' : 'CRITICAL') : 'NO_DATA',
        explanation: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0 ? 'Capillary oxygen saturation level.' : 'No SpO₂ pulse oximeter data recorded.',
        source: 'Pulse Oximeter',
        hasData: typeof currentHealth?.spo2 === 'number' && currentHealth.spo2 > 0,
      },
      {
        id: 'resp_rate',
        name: 'Respiratory Rate',
        valueDisplay: typeof currentHealth?.respiratoryRate === 'number' && currentHealth.respiratoryRate > 0 ? `${currentHealth.respiratoryRate}` : 'No Recent Data',
        unit: typeof currentHealth?.respiratoryRate === 'number' && currentHealth.respiratoryRate > 0 ? 'breaths/min' : '',
        baselineDisplay: respBase ? `${respBase.baseline14d} br/m` : '12 – 18 br/m',
        deviationPercent: respBase ? respBase.deviationPercent : undefined,
        trend: respBase?.trend || 'STABLE',
        status: typeof currentHealth?.respiratoryRate === 'number' && currentHealth.respiratoryRate > 0 ? (currentHealth.respiratoryRate >= 10 && currentHealth.respiratoryRate <= 22 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.respiratoryRate === 'number' && currentHealth.respiratoryRate > 0 ? 'Resting respiratory rate per minute.' : 'No respiratory rate telemetry recorded.',
        source: 'Respiratory Sensor',
        hasData: typeof currentHealth?.respiratoryRate === 'number' && currentHealth.respiratoryRate > 0,
      },
    ],
  };

  // 5. MUSCLES & MUSCULOSKELETAL SYSTEM
  const hasMusclesData = !!(
    currentHealth?.exerciseDurationMinutes !== undefined ||
    currentHealth?.resistanceLoadKg !== undefined ||
    currentHealth?.aerobicOutputWatts !== undefined
  );

  const muscles: AnatomicalRegionData = {
    id: 'MUSCLES',
    title: 'MUSCULOSKELETAL SYSTEM',
    subtitle: 'Skeletal Mass & Physical Countermeasures',
    systemCategory: 'FITNESS',
    status: physicalSystem ? physicalSystem.status : defaultStatusInfo,
    healthIndexScore: physicalSystem ? Math.round(physicalSystem.fitness.performancePercent) : null,
    primaryMetricSummary: hasMusclesData 
      ? `Exercise: ${currentHealth?.exerciseDurationMinutes ?? 'No Data'}m • Load: ${currentHealth?.resistanceLoadKg ?? 'No Data'}kg` 
      : 'No Fitness Data',
    description: 'Tracks mandatory daily physical exercise countermeasures (ARED / T2 Treadmill) to mitigate microgravity muscle atrophy.',
    lastUpdated: timestamp,
    source: 'ARED & T2 Ergometer Telemetry',
    targetDomain: 'FITNESS',
    hasData: hasMusclesData,
    metrics: [
      {
        id: 'exercise_duration',
        name: 'Exercise Countermeasure Duration',
        valueDisplay: typeof currentHealth?.exerciseDurationMinutes === 'number' && currentHealth.exerciseDurationMinutes > 0 ? `${currentHealth.exerciseDurationMinutes}` : 'No Recent Data',
        unit: typeof currentHealth?.exerciseDurationMinutes === 'number' && currentHealth.exerciseDurationMinutes > 0 ? 'min' : '',
        baselineDisplay: exerciseBase ? `${exerciseBase.baseline14d} min` : '40 – 60 min',
        deviationPercent: exerciseBase ? exerciseBase.deviationPercent : undefined,
        trend: exerciseBase?.trend || 'STABLE',
        status: typeof currentHealth?.exerciseDurationMinutes === 'number' && currentHealth.exerciseDurationMinutes > 0 ? (currentHealth.exerciseDurationMinutes >= 30 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.exerciseDurationMinutes === 'number' && currentHealth.exerciseDurationMinutes > 0 ? 'Daily mandatory physical exercise countermeasure duration.' : 'No exercise session logged today.',
        source: 'Fitness Ergometer',
        hasData: typeof currentHealth?.exerciseDurationMinutes === 'number' && currentHealth.exerciseDurationMinutes > 0,
      },
      {
        id: 'resistance_load',
        name: 'Advanced Resistive Training Load (ARED)',
        valueDisplay: typeof currentHealth?.resistanceLoadKg === 'number' && currentHealth.resistanceLoadKg > 0 ? `${currentHealth.resistanceLoadKg}` : 'No Recent Data',
        unit: typeof currentHealth?.resistanceLoadKg === 'number' && currentHealth.resistanceLoadKg > 0 ? 'kg' : '',
        baselineDisplay: '120 – 160 kg',
        trend: 'UP',
        status: typeof currentHealth?.resistanceLoadKg === 'number' && currentHealth.resistanceLoadKg > 0 ? 'NORMAL' : 'NO_DATA',
        explanation: typeof currentHealth?.resistanceLoadKg === 'number' && currentHealth.resistanceLoadKg > 0 ? 'Resistive loading for bone and muscle mass retention.' : 'No resistive load session recorded.',
        source: 'ARED Ergometer',
        hasData: typeof currentHealth?.resistanceLoadKg === 'number' && currentHealth.resistanceLoadKg > 0,
      },
      {
        id: 'aerobic_watts',
        name: 'Aerobic Power Output',
        valueDisplay: typeof currentHealth?.aerobicOutputWatts === 'number' && currentHealth.aerobicOutputWatts > 0 ? `${currentHealth.aerobicOutputWatts}` : 'No Recent Data',
        unit: typeof currentHealth?.aerobicOutputWatts === 'number' && currentHealth.aerobicOutputWatts > 0 ? 'Watts' : '',
        baselineDisplay: '180 – 240 W',
        trend: 'STABLE',
        status: typeof currentHealth?.aerobicOutputWatts === 'number' && currentHealth.aerobicOutputWatts > 0 ? 'NORMAL' : 'NO_DATA',
        explanation: typeof currentHealth?.aerobicOutputWatts === 'number' && currentHealth.aerobicOutputWatts > 0 ? 'Mechanical power output on cycle ergometer.' : 'No aerobic power output recorded.',
        source: 'Cycle Ergometer',
        hasData: typeof currentHealth?.aerobicOutputWatts === 'number' && currentHealth.aerobicOutputWatts > 0,
      },
    ],
  };

  // 6. THERMOREGULATION & HYDRATION
  const hasThermoHydrationData = !!(
    currentHealth?.coreTemperature !== undefined ||
    currentHealth?.hydrationIndex !== undefined
  );

  const thermoregulationHydration: AnatomicalRegionData = {
    id: 'THERMOREGULATION_HYDRATION',
    title: 'THERMOREGULATION & HYDRATION',
    subtitle: 'Whole-Body Fluid & Thermal Homeostasis',
    systemCategory: 'FITNESS',
    status: (currentHealth?.hydrationIndex ?? 0) >= 80 ? {
      label: 'STABLE',
      textColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300',
      dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
      barColor: 'from-emerald-500 to-teal-400',
    } : defaultStatusInfo,
    healthIndexScore: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0 ? currentHealth.hydrationIndex : null,
    primaryMetricSummary: hasThermoHydrationData 
      ? `Temp: ${currentHealth?.coreTemperature ? currentHealth.coreTemperature.toFixed(1) + '°C' : 'No Data'} • Hydration: ${currentHealth?.hydrationIndex ? currentHealth.hydrationIndex + '%' : 'No Data'}` 
      : 'No Thermoregulation Data',
    description: 'Tracks whole-body core body temperature regulation and bio-impedance hydration balance.',
    lastUpdated: timestamp,
    source: 'Wearable Sensor & Hydration Sensor',
    targetDomain: 'FITNESS',
    hasData: hasThermoHydrationData,
    metrics: [
      {
        id: 'core_temperature',
        name: 'Core Body Temperature',
        valueDisplay: typeof currentHealth?.coreTemperature === 'number' && currentHealth.coreTemperature > 0 ? `${currentHealth.coreTemperature.toFixed(1)}` : 'No Recent Data',
        unit: typeof currentHealth?.coreTemperature === 'number' && currentHealth.coreTemperature > 0 ? '°C' : '',
        baselineDisplay: tempBase ? `${tempBase.baseline14d.toFixed(1)}°C` : '36.5 – 37.3°C',
        deviationPercent: tempBase ? tempBase.deviationPercent : undefined,
        trend: tempBase?.trend || 'STABLE',
        status: typeof currentHealth?.coreTemperature === 'number' && currentHealth.coreTemperature > 0 ? (currentHealth.coreTemperature >= 36.3 && currentHealth.coreTemperature <= 37.4 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.coreTemperature === 'number' && currentHealth.coreTemperature > 0 ? 'Whole-body core temperature thermal regulation.' : 'No core temperature telemetry recorded.',
        source: 'Wearable Sensor',
        hasData: typeof currentHealth?.coreTemperature === 'number' && currentHealth.coreTemperature > 0,
      },
      {
        id: 'hydration_index',
        name: 'Hydration Balance Index',
        valueDisplay: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0 ? `${currentHealth.hydrationIndex}` : 'No Recent Data',
        unit: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0 ? '%' : '',
        baselineDisplay: hydBase ? `${hydBase.baseline14d}%` : '85 – 98%',
        deviationPercent: hydBase ? hydBase.deviationPercent : undefined,
        trend: hydBase?.trend || 'STABLE',
        status: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0 ? (currentHealth.hydrationIndex >= 80 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0 ? 'Systemic bio-impedance fluid retention balance.' : 'No hydration balance telemetry recorded.',
        source: 'Hydration Sensor',
        hasData: typeof currentHealth?.hydrationIndex === 'number' && currentHealth.hydrationIndex > 0,
      },
    ],
  };

  // 7. RADIATION EXPOSURE
  const hasRadiationData = !!(
    currentHealth?.dailyRadiation_uSv !== undefined ||
    currentHealth?.cumulativeRadiation_mSv !== undefined
  );

  const radiation: AnatomicalRegionData = {
    id: 'RADIATION',
    title: 'WHOLE-BODY RADIATION EXPOSURE',
    subtitle: 'Galactic Cosmic Rays (GCR) & Solar Particle Events (SPE)',
    systemCategory: 'RADIATION',
    status: (currentHealth?.dailyRadiation_uSv ?? 0) <= 400 ? {
      label: 'STABLE',
      textColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300',
      dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
      barColor: 'from-emerald-500 to-teal-400',
    } : defaultStatusInfo,
    healthIndexScore: typeof currentHealth?.dailyRadiation_uSv === 'number' ? Math.max(40, Math.min(100, Math.round(100 - (currentHealth.dailyRadiation_uSv / 10)))) : null,
    primaryMetricSummary: hasRadiationData 
      ? `Daily: ${currentHealth?.dailyRadiation_uSv ?? 'No Data'} μSv/day • Cumulative: ${currentHealth?.cumulativeRadiation_mSv ? currentHealth.cumulativeRadiation_mSv.toFixed(1) + ' mSv' : 'No Data'}` 
      : 'No Radiation Data',
    description: 'Active personal active dosimeter telemetry tracking cosmic radiation exposure.',
    lastUpdated: timestamp,
    source: 'Personal Dosimeter RAD-CREW-01',
    targetDomain: 'RADIATION',
    hasData: hasRadiationData,
    metrics: [
      {
        id: 'daily_radiation',
        name: 'Daily Dose Equivalent',
        valueDisplay: typeof currentHealth?.dailyRadiation_uSv === 'number' ? `${currentHealth.dailyRadiation_uSv}` : 'No Recent Data',
        unit: typeof currentHealth?.dailyRadiation_uSv === 'number' ? 'μSv / day' : '',
        baselineDisplay: radBase ? `${radBase.baseline14d} μSv` : '200 – 400 μSv',
        deviationPercent: radBase ? radBase.deviationPercent : undefined,
        trend: radBase?.trend || 'STABLE',
        status: typeof currentHealth?.dailyRadiation_uSv === 'number' ? (currentHealth.dailyRadiation_uSv <= 400 ? 'NORMAL' : 'ATTENTION') : 'NO_DATA',
        explanation: typeof currentHealth?.dailyRadiation_uSv === 'number' ? 'Daily ionizing radiation dose equivalent accumulated.' : 'No active dosimeter readings logged today.',
        source: 'Personal Active Dosimeter',
        hasData: typeof currentHealth?.dailyRadiation_uSv === 'number',
      },
      {
        id: 'cumulative_radiation',
        name: 'Mission Cumulative Exposure',
        valueDisplay: typeof currentHealth?.cumulativeRadiation_mSv === 'number' ? `${currentHealth.cumulativeRadiation_mSv.toFixed(1)}` : 'No Recent Data',
        unit: typeof currentHealth?.cumulativeRadiation_mSv === 'number' ? 'mSv' : '',
        baselineDisplay: 'NASA Limit: 600 mSv',
        trend: 'UP',
        status: typeof currentHealth?.cumulativeRadiation_mSv === 'number' ? (currentHealth.cumulativeRadiation_mSv <= 300 ? 'NORMAL' : 'MONITOR') : 'NO_DATA',
        explanation: typeof currentHealth?.cumulativeRadiation_mSv === 'number' ? 'Total mission/career ionizing radiation exposure.' : 'No cumulative radiation total recorded.',
        source: 'Dosimetry Archive',
        hasData: typeof currentHealth?.cumulativeRadiation_mSv === 'number',
      },
    ],
  };

  return {
    WHOLE_BODY: wholeBody,
    BRAIN: brain,
    HEART: heart,
    LUNGS: lungs,
    MUSCLES: muscles,
    THERMOREGULATION_HYDRATION: thermoregulationHydration,
    RADIATION: radiation,
  };
}
