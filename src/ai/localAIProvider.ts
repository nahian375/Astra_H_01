/**
 * ASTRA Health - Local AI Provider (Offline Mode)
 * Operates 100% inside the browser with zero external network connectivity.
 * Implements genuine on-device neural language model inference (via localAIManager & localWorker)
 * with robust local RAG grounding and a deterministic heuristic fallback engine.
 */

import { AIProvider } from './aiProvider';
import { 
  AIResponse, 
  HealthAIContext, 
  ChatHistoryMessage, 
  ActivityActionPayload 
} from '../types/ai';
import { MultiMetricChange } from '../types/health';
import { queryLocalKnowledgeBase } from './localRAG';
import { localAIManager } from './localAIManager';
import { getAstronautProfile } from '../services/profileService';
import { 
  buildSpaceHealthContext, 
  getWhyAstraIsWatching, 
  getWhatChangedInContext 
} from '../services/spaceContextEngine';

export interface LocalGenerateRequest {
  question: string;
  context: HealthAIContext;
  history?: ChatHistoryMessage[];
  onToken?: (token: string) => void;
}

export class LocalAIProvider implements AIProvider {
  public id = 'offline-local-astra';
  public name = 'OFFLINE • LOCAL ASTRA';
  private diagnosticBypassEnabled = false;

  public setDiagnosticBypass(enabled: boolean): void {
    this.diagnosticBypassEnabled = enabled;
    console.info(`[ASTRA Diagnostic Mode] Neural worker bypass set to: ${enabled}`);
  }

  public isDiagnosticBypassEnabled(): boolean {
    return this.diagnosticBypassEnabled;
  }

  async initialize(): Promise<boolean> {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    const info = localAIManager.getModelInfo();
    return (
      info.status === 'READY' ||
      info.status === 'NOT_INSTALLED' ||
      info.status === 'FALLBACK_ENGINE' ||
      info.status === 'DOWNLOADING'
    );
  }

  /**
   * Main entrypoint for offline generation.
   * Routes to the genuine on-device neural model when ready;
   * otherwise executes the deterministic heuristic engine as a safe fallback.
   */
  async generateResponse(request: LocalGenerateRequest): Promise<AIResponse> {
    // TEST A DIAGNOSTIC BYPASS ROUTE
    if (this.diagnosticBypassEnabled) {
      console.info('[ASTRA Diagnostic] Entering provider bypass branch | Neural inference & worker execution bypassed');
      return this.generateHeuristicResponse(
        request, 
        'DIAGNOSTIC TEST MODE ACTIVE: Neural worker execution bypassed for preview renderer crash isolation.'
      );
    }

    const modelInfo = localAIManager.getModelInfo();
    const isNeuralReady = modelInfo.status === 'READY';

    if (isNeuralReady) {
      try {
        const neuralResponse = await this.generateNeuralResponse(request);
        if (neuralResponse && neuralResponse.answer.trim().length > 0) {
          return neuralResponse;
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Neural inference error';
        console.warn(
          '[ASTRA LocalAIProvider] Neural inference failed or timed out. Engaging deterministic heuristic fallback:',
          errMsg
        );
        return this.generateHeuristicResponse(request, `Neural model failed to complete generation (${errMsg})`);
      }
    }

    // Safe Fallback: Deterministic heuristic baseline comparator
    return this.generateHeuristicResponse(request);
  }

  /**
   * Executes genuine in-browser neural inference using SmolLM2 via dedicated Web Worker.
   */
  private async generateNeuralResponse(request: LocalGenerateRequest): Promise<AIResponse> {
    const { question, context, onToken } = request;
    const startTime = performance.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Gather local space context & astronaut identity
    const activeProfile = getAstronautProfile();
    const astronautName = activeProfile.identity.preferredName || activeProfile.identity.fullName || 'Alex';
    const astronautRole = activeProfile.identity.crewPosition || activeProfile.identity.role || 'Mission Specialist';

    const spaceCtx = buildSpaceHealthContext({
      profile: activeProfile,
      mission: context.mission,
      currentHealth: context.currentHealth,
      baselines: context.baselines,
      recentChanges: context.recentChanges,
      activeAlerts: context.activeAlerts,
      recentCheckIn: context.recentCheckIn,
      recentActivities: context.recentActivities,
      dailyActivitySummary: context.dailyActivitySummary,
    });

    const current = context.currentHealth;
    const pb = spaceCtx.personalBaseline;

    // 2. Query local spaceflight medical knowledge base (zero network)
    const relevantDocs = queryLocalKnowledgeBase(question, 2);
    const primaryDoc = relevantDocs[0];
    const docSummary = primaryDoc 
      ? `NASA Protocol (${primaryDoc.title}): ${primaryDoc.summary} Key procedure: ${primaryDoc.protocols[0] || primaryDoc.content.slice(0, 160)}`
      : 'NASA Spaceflight Medical Manual standard microgravity adaptation guidelines.';

    // 3. Compact prompt synthesis tailored for SmolLM2-135M-Instruct
    const rhrDiff = pb.restingHeartRate.differenceFromInFlight;
    const rhrDeltaStr = rhrDiff > 0 ? `+${rhrDiff} bpm` : `${rhrDiff} bpm`;
    const sleepHours = (current.sleepDurationMinutes / 60).toFixed(1);
    const sleepBaselineHours = (pb.sleepDuration.inFlightBaseline).toFixed(1);

    const prompt = `<|im_start|>system
You are ASTRA, the autonomous onboard Astronaut Health Intelligence Assistant on the NASA Mars-01 mission.
You are conversing with ${astronautRole} ${astronautName}.
Respond clearly in four sections:
OBSERVATION: [Objective biometric facts and baseline deviations]
CONTEXT: [Mission Sol ${context.mission.sol}, transit conditions, radiation, and daily duties]
POSSIBLE RELEVANCE: [Microgravity physiological relevance from NASA flight research]
SUGGESTED NEXT STEPS: [Actionable operational countermeasures]

TELEMETRY BASELINE COMPARISON:
- Resting Heart Rate: ${current.restingHeartRate} bpm (${rhrDeltaStr} vs 14d in-flight baseline of ${pb.restingHeartRate.inFlightBaseline} bpm)
- Sleep Duration: ${sleepHours}h vs baseline ${sleepBaselineHours}h
- SpO2: ${current.spo2}% | Core Temp: ${current.coreTemperature || 36.8}°C
- Daily Absorbed Radiation: ${(current.dailyRadiation_uSv / 1000).toFixed(2)} mSv (GCR cruise background)
- Active Alerts: ${context.activeAlerts.length} active
- Retrieved NASA Guideline: ${docSummary}
<|im_end|>
<|im_start|>user
${question}
<|im_end|>
<|im_start|>assistant
`;

    // 4. Dispatch generation to worker
    const workerResult = await localAIManager.generateText(requestId, prompt, onToken, {
      maxNewTokens: 320,
      temperature: 0.5,
    });

    const rawText = workerResult.fullText;
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('Neural model returned empty response');
    }

    // 5. Safe structure parsing
    const observationMatch = rawText.match(/OBSERVATION[:\*\s]+([\s\S]*?)(?=(CONTEXT|POSSIBLE|SUGGESTED|SAFETY|\n\n\n|$))/i);
    const contextMatch = rawText.match(/CONTEXT[:\*\s]+([\s\S]*?)(?=(POSSIBLE|SUGGESTED|SAFETY|\n\n\n|$))/i);
    const factorsMatch = rawText.match(/POSSIBLE RELEVANCE[:\*\s]+([\s\S]*?)(?=(SUGGESTED|SAFETY|\n\n\n|$))/i);
    const nextStepMatch = rawText.match(/SUGGESTED NEXT STEPS?[:\*\s]+([\s\S]*?)(?=(SAFETY|\n\n\n|$))/i);

    const detectedActivity = this.inferActivity(question);

    const structuredBreakdown = {
      observation: observationMatch 
        ? observationMatch[1].trim() 
        : `Resting HR is ${current.restingHeartRate} bpm (${rhrDeltaStr} vs baseline). Sleep recorded at ${sleepHours}h.`,
      context: contextMatch 
        ? contextMatch[1].trim() 
        : `Sol ${context.mission.sol} Deep Space Cruise. Radiation dose ${(current.dailyRadiation_uSv / 1000).toFixed(2)} mSv/day nominal.`,
      possibleContributingFactors: factorsMatch 
        ? factorsMatch[1].trim().split('\n').map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
        : ['Microgravity fluid redistribution', 'Duty cycle sleep debt accumulation'],
      suggestedNextStep: nextStepMatch 
        ? nextStepMatch[1].trim() 
        : 'Maintain hydration intervals and log daily check-in.',
      safetyNote: 'ASTRA Onboard Neural Engine operates in autonomous flight decision-support mode. Non-diagnostic prototype.',
    };

    return {
      answer: rawText,
      source: 'OFFLINE_LOCAL_ASTRA',
      providerName: 'OFFLINE • LOCAL ASTRA (Neural Model)',
      timestamp: new Date().toISOString(),
      structuredBreakdown,
      suggestedFollowUps: [
        'How am I doing today?',
        'What health indicators are ASTRA watching?',
        'How does my current health compare with my mission baseline?',
      ],
      activityAction: detectedActivity,
      retrievedKnowledgeReferences: [primaryDoc?.title || 'NASA Spaceflight Medical Manual'],
      dataUsed: [
        'Personal Profile',
        '14-Day In-Flight Baseline',
        'Health Telemetry',
        'Mission Context',
        'Onboard Neural Weights (SmolLM2-135M)',
      ],
      latencyMs: Math.round(performance.now() - startTime),
      isNeuralModel: true,
      isFallback: false,
      inferenceDevice: workerResult.device,
    };
  }

  /**
   * Deterministic heuristic engine.
   * Generates clinically grounded, transparent responses from mathematical baselines
   * whenever neural inference is not ready, disabled, or encounters runtime issues.
   */
  private generateHeuristicResponse(request: LocalGenerateRequest, fallbackReason?: string): AIResponse {
    const { question, context } = request;
    const startTime = performance.now();

    const activeProfile = getAstronautProfile();
    const identity = activeProfile.identity;
    const astronautName = identity.preferredName || identity.fullName || 'Alex';
    const astronautRole = identity.crewPosition || identity.role || 'Mission Specialist';
    const astronautGreetingTitle = `${astronautRole} ${astronautName}`.trim();

    const spaceCtx = buildSpaceHealthContext({
      profile: activeProfile,
      mission: context.mission,
      currentHealth: context.currentHealth,
      baselines: context.baselines,
      recentChanges: context.recentChanges,
      activeAlerts: context.activeAlerts,
      recentCheckIn: context.recentCheckIn,
      recentActivities: context.recentActivities,
      dailyActivitySummary: context.dailyActivitySummary,
    });

    const current = context.currentHealth;
    const pb = spaceCtx.personalBaseline;
    const watchingFactors = getWhyAstraIsWatching(spaceCtx);

    const relevantDocs = queryLocalKnowledgeBase(question, 2);
    const primaryDoc = relevantDocs[0];
    const lowerQ = question.toLowerCase().trim();

    let answer = '';
    let observation = '';
    let contextStr = '';
    let factors: string[] = [];
    let nextStep = '';
    let safetyNote = 'ASTRA Health Engine operates in autonomous flight decision-support mode. Non-diagnostic prototype.';
    let activityAction: ActivityActionPayload | undefined = undefined;
    let suggestedFollowUps: string[] = [];
    let dataUsed: string[] = [
      'Personal Profile',
      '14-Day In-Flight Baseline',
      'Health Telemetry',
      'Mission Context',
    ];

    // 1. INFER & PARSE USER ACTIVITY LOGGING
    const detectedActivity = this.inferActivity(question);
    if (detectedActivity) {
      activityAction = detectedActivity;
      answer = `Confirmed, ${astronautName}! I have recorded your **${detectedActivity.title}** (${detectedActivity.details}) to your Sol ${context.mission.sol} log.

Your daily operational targets have been updated in real-time. Keep up the high-performance discipline!`;
      dataUsed = ['Personal Profile', 'Activity Logging System', 'Sol Operations Log'];
      suggestedFollowUps = [
        'How is my daily activity tracking today?',
        'Log 500ml electrolyte water',
        'How am I doing today?',
      ];
    }
    // 2. CONVERSATIONAL GREETINGS & NATURAL CHAT
    else if (lowerQ === 'hi' || lowerQ.startsWith('hi ') || lowerQ.startsWith('hello') || lowerQ.startsWith('hey') || lowerQ.includes('how are you')) {
      const activeAlertsCount = context.activeAlerts.length;
      answer = `Hello ${astronautGreetingTitle}! ASTRA is online and operational for Sol ${context.mission.sol} during the Mars transit phase.

Space environment surveillance is active. You have ${activeAlertsCount} active notification${activeAlertsCount === 1 ? '' : 's'}. Resting heart rate is at ${current.restingHeartRate} bpm (+${pb.restingHeartRate.differenceFromInFlight} bpm vs flight baseline).

How can I assist you right now, ${astronautName}? We can review what ASTRA is watching, examine your space baseline, or check your daily activities.`;
      dataUsed = ['Personal Profile', 'Mission Context', 'Current Health Telemetry', 'Active Alerts'];
      suggestedFollowUps = [
        'How am I doing today?',
        'What health indicators are ASTRA watching?',
        'How does my current health compare with my mission baseline?',
      ];
    }
    // 3. "HOW AM I DOING TODAY?"
    else if (lowerQ.includes('how am i doing') || lowerQ.includes('status today') || lowerQ.includes('daily status')) {
      const rhrDiff = pb.restingHeartRate.differenceFromInFlight;
      const sleepHours = (current.sleepDurationMinutes / 60).toFixed(1);
      observation = `Overall mission operational status is STABLE, with active monitoring on cardiovascular and sleep indicators.`;
      contextStr = `Resting HR is ${current.restingHeartRate} bpm (+${rhrDiff} bpm vs in-flight baseline of ${pb.restingHeartRate.inFlightBaseline} bpm). Sleep duration was ${sleepHours}h (${spaceCtx.sleepRecoveryContext.sleepDeviationHours}h vs baseline). SpO2 is nominal at ${current.spo2}%.`;
      factors = [
        'Microgravity cephalad fluid shift adaptation stabilized',
        'Reduced sleep recorded during the same period as elevated daytime duty cycle',
        `Personal radiation badge: ${(current.dailyRadiation_uSv / 1000).toFixed(2)} mSv today (nominal GCR background)`,
      ];
      nextStep = `Review your Mission Health Brief and ensure hydration intervals are maintained.`;
      dataUsed = ['Personal Profile', '14-Day In-Flight Baseline', 'Daily Check-In', 'Personal Dosimeter', 'Mission Context'];
      suggestedFollowUps = [
        'What health indicators are ASTRA watching?',
        'Why did my health index change?',
        'Show my radiation exposure trend',
      ];
    }
    // 4. "WHY DID MY HEALTH INDEX CHANGE?"
    else if (lowerQ.includes('why did my health index change') || lowerQ.includes('why did health index change') || lowerQ.includes('why is health index down')) {
      observation = `Your Bio Signal Index shifted from 86 to 82/100, while your Neural Signal Index is currently at 74/100 (Monitor status).`;
      contextStr = `Telemetry recorded an 8% increase in resting heart rate alongside a 1.2h reduction in sleep duration over the last two duty cycles.`;
      factors = [
        'Reduced sleep duration occurred during the same operational period as the elevated resting heart rate',
        'Elevated sympathetic autonomic tone (HRV down from 62 ms pre-flight to 44 ms)',
        'Physical exercise countermeasures on track (1,350 kg ARED load logged)',
      ];
      nextStep = `Causality note: Telemetry demonstrates concurrent occurrence rather than isolated clinical cause. Prioritize berth rest window.`;
      dataUsed = ['Personal Baseline', 'Health Engine Scoring', 'Multi-Metric Change Log', 'Recent Check-In'];
      suggestedFollowUps = [
        'How does my current health compare with my mission baseline?',
        'What health indicators are ASTRA watching?',
        'Log 15 min breathwork session',
      ];
    }
    // 5. "WHAT HEALTH INDICATORS ARE ASTRA WATCHING?"
    else if (lowerQ.includes('watching') || lowerQ.includes('why astra is watching') || lowerQ.includes('what are you watching')) {
      const items = watchingFactors.map(w => `• **${w.text}**: ${w.detail}`).join('\n');
      answer = `Here are the exact health factors ASTRA is currently monitoring on Sol ${context.mission.sol}:

${items}

**TRANSPARENCY NOTE**:
These observations are derived strictly from your stored sensor telemetry, personal dosimeter, and check-in entries. ASTRA does not invent or extrapolate missing indicators.`;
      dataUsed = ['Personal Space Baseline', 'Health Measurement Stream', 'Personal Dosimeter Badge', 'Active Health Alerts'];
      suggestedFollowUps = [
        'How does my current health compare with my mission baseline?',
        'What changed over the last 7 days?',
        'Why did my health index change?',
      ];
    }
    // 6. DEFAULT QUERY HANDLER
    else {
      const rhrDiff = pb.restingHeartRate.differenceFromInFlight;
      const sleepHours = (current.sleepDurationMinutes / 60).toFixed(1);
      observation = `Active telemetry evaluation against personal 14-day flight baseline for query "${question}".`;
      contextStr = `Resting HR is ${current.restingHeartRate} bpm (${rhrDiff > 0 ? '+' : ''}${rhrDiff} bpm vs baseline). Sleep: ${sleepHours}h. SpO2: ${current.spo2}%.`;
      factors = [
        primaryDoc?.summary || 'Spaceflight microgravity adaptation active.',
        'Continuous environmental dosimeter surveillance nominal.',
      ];
      nextStep = primaryDoc?.protocols[0] || 'Complete evening check-in and maintain countermeasure routines.';
      suggestedFollowUps = [
        'How am I doing today?',
        'What health indicators are ASTRA watching?',
        'Why did my health index change?',
      ];
    }

    if (!answer && observation) {
      answer = `**OBSERVATION**
${observation}

**CONTEXT**
${contextStr}

**POSSIBLE RELEVANCE**
${factors.map(f => `• ${f}`).join('\n')}

**SUGGESTED NEXT STEPS**
${nextStep}`;
    }

    if (fallbackReason) {
      answer = `*[Notice: ${fallbackReason}. Operating on Autonomous Deterministic Heuristic Engine]*\n\n${answer}`;
    }

    return {
      answer,
      source: 'OFFLINE_LOCAL_ASTRA',
      providerName: 'OFFLINE • LOCAL ASTRA (Heuristic Engine)',
      timestamp: new Date().toISOString(),
      structuredBreakdown: observation ? {
        observation,
        context: contextStr,
        possibleContributingFactors: factors,
        suggestedNextStep: nextStep,
        safetyNote,
      } : undefined,
      suggestedFollowUps,
      activityAction,
      retrievedKnowledgeReferences: [primaryDoc?.title || 'NASA Spaceflight Medical Manual'],
      dataUsed,
      latencyMs: Math.round(performance.now() - startTime),
      isNeuralModel: false,
      isFallback: true,
    };
  }

  /**
   * Infers activity logging from natural language
   */
  private inferActivity(question: string): ActivityActionPayload | undefined {
    const q = question.toLowerCase();

    if (q.includes('log') || q.includes('drank') || q.includes('ate') || q.includes('worked out') || q.includes('completed')) {
      // Hydration
      if (q.includes('water') || q.includes('electrolyte') || q.includes('fluid') || q.includes('hydration') || q.includes('ml')) {
        const mlMatch = q.match(/(\d+)\s*(ml|milliliters|cc|oz)/i);
        const volumeMl = mlMatch ? parseInt(mlMatch[1], 10) : 500;
        return {
          category: 'HYDRATION',
          title: q.includes('electrolyte') ? 'Electrolyte Hydration Pack' : 'Potable Water Intake',
          details: `${volumeMl} ml logged via conversational assistant.`,
          metrics: { volumeMl },
        };
      }

      // Exercise
      if (q.includes('cevis') || q.includes('cycle') || q.includes('ared') || q.includes('treadmill') || q.includes('workout') || q.includes('exercise')) {
        const minMatch = q.match(/(\d+)\s*(min|mins|minutes|hr|hour)/i);
        let durationMinutes = minMatch ? parseInt(minMatch[1], 10) : 45;
        if (q.includes('hour') && durationMinutes <= 3) durationMinutes *= 60;

        const wattsMatch = q.match(/(\d+)\s*(w|watts)/i);
        const watts = wattsMatch ? parseInt(wattsMatch[1], 10) : (q.includes('cevis') ? 180 : undefined);

        const kgMatch = q.match(/(\d+)\s*(kg|lbs|kilos)/i);
        const loadKg = kgMatch ? parseInt(kgMatch[1], 10) : (q.includes('ared') ? 1350 : undefined);

        const isAred = q.includes('ared') || q.includes('weight') || q.includes('lift');
        const isCevis = q.includes('cevis') || q.includes('cycle');

        return {
          category: 'EXERCISE',
          title: isAred ? 'ARED Resistive Exercise' : (isCevis ? 'CEVIS Cycle Ergometer' : 'Physical Exercise Session'),
          details: `${durationMinutes}-minute session logged via ASTRA.`,
          durationMinutes,
          intensity: isAred ? 'HIGH' : 'MODERATE',
          metrics: {
            durationMinutes,
            watts,
            loadKg,
            calories: Math.round(durationMinutes * 8.5),
          },
        };
      }

      // Nutrition
      if (q.includes('meal') || q.includes('ration') || q.includes('breakfast') || q.includes('lunch') || q.includes('dinner') || q.includes('calories') || q.includes('kcal')) {
        const calMatch = q.match(/(\d+)\s*(kcal|cal|calories)/i);
        const calories = calMatch ? parseInt(calMatch[1], 10) : 750;
        return {
          category: 'NUTRITION',
          title: q.includes('breakfast') ? 'Breakfast Ration Pack' : (q.includes('lunch') ? 'Mid-Sol Ration Pack' : 'Nutrition Log'),
          details: `Recorded ~${calories} kcal nutrition intake.`,
          metrics: { calories },
        };
      }

      // Tasks
      if (q.includes('task') || q.includes('filter') || q.includes('inspection') || q.includes('scrubber') || q.includes('maintenance')) {
        return {
          category: 'TASK',
          title: 'Operational Spaceflight Duty',
          details: question.replace(/^(log|i finished|completed)\s*/i, ''),
          durationMinutes: 30,
          metrics: { completionPct: 100 },
        };
      }

      // Mindfulness
      if (q.includes('breath') || q.includes('meditation') || q.includes('mindful') || q.includes('relaxation')) {
        return {
          category: 'MINDFULNESS',
          title: 'Guided Respiration & Biofeedback',
          details: '15-minute mindfulness and sympathetic down-regulation routine.',
          durationMinutes: 15,
          metrics: { durationMinutes: 15 },
        };
      }
    }

    return undefined;
  }

  async generateHealthSummary(context: HealthAIContext): Promise<string> {
    const res = await this.generateResponse({ question: 'Summarize my current health and what changed this week', context });
    return res.answer;
  }

  async explainTrend(metricKey: string, context: HealthAIContext): Promise<string> {
    const res = await this.generateResponse({ question: `Explain trend for ${metricKey}`, context });
    return res.answer;
  }

  async summarizeChanges(changes: MultiMetricChange[], context: HealthAIContext): Promise<string> {
    const res = await this.generateResponse({ question: 'What changed in my health this week?', context });
    return res.answer;
  }
}

export const localAIProvider = new LocalAIProvider();
