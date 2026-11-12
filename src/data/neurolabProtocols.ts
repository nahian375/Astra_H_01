/**
 * ASTRA Health - Neuro-Lab Protocols & Level Definitions
 * Contains calibrated test parameters, timing schedules, and scientific instructions.
 */

import { NeuroLevelConfig, NeuroTaskType, NeuroLevelId } from '../types/neurolab';

export const NEURO_LEVELS: Record<NeuroTaskType, Record<NeuroLevelId, NeuroLevelConfig>> = {
  PVT: {
    1: {
      level: 1,
      name: 'Cadet',
      badge: '🎖️ Cadet',
      badgeEmoji: '🎖️',
      title: 'Cadet Baseline Reaction Protocol',
      description: 'Foundational visual reaction task with randomized 2–4s inter-stimulus intervals.',
      protocolCode: 'PVT-L1-CADET',
      trialCount: 5,
      timingSummary: '5 trials • 2.0–4.0s ISI • ~25s duration',
      instructions: [
        'Keep your eyes focused on the central crosshair (+).',
        'When the digital counter turns GREEN and begins counting, click TAP NOW or press SPACE immediately.',
        'Premature taps before stimulus onset will be recorded as false starts.',
        'Reaction times exceeding 500 ms are classified as attentional lapses.'
      ],
      scientificRationale: 'Establishes baseline simple motor reaction latency and neuromuscular response readiness without cognitive distractor load.'
    },
    2: {
      level: 2,
      name: 'Pilot',
      badge: '🚀 Pilot',
      badgeEmoji: '🚀',
      title: 'Pilot Variable Latency Assessment',
      description: 'Extended trial series with 2–6s variable delay windows to test response consistency.',
      protocolCode: 'PVT-L2-PILOT',
      trialCount: 8,
      timingSummary: '8 trials • 2.0–6.0s ISI • ~45s duration',
      instructions: [
        'Maintain visual fixation on the central reticle.',
        'Intervals between stimuli are unpredictable (2 to 6 seconds).',
        'Avoid anticipatory tapping; wait for the definitive green stimulus.',
        'Aim for optimal decile response under 240 ms.'
      ],
      scientificRationale: 'Evaluates the astronaut\'s ability to maintain motor inhibition during variable pre-stimulus intervals.'
    },
    3: {
      level: 3,
      name: 'Specialist',
      badge: '🔬 Specialist',
      badgeEmoji: '🔬',
      title: 'Specialist Sustained Vigilance Session',
      description: 'Expanded 12-trial sustained psychomotor assessment with prolonged waiting periods.',
      protocolCode: 'PVT-L3-SPEC',
      trialCount: 12,
      timingSummary: '12 trials • 2.0–8.0s ISI • ~75s duration',
      instructions: [
        'Prolonged vigilance session testing sustained neurological focus.',
        'Stimulus delays extend up to 8 seconds.',
        'Maintain alertness against microsleeps and attentional slips.',
        'Tap the trigger area or press SPACE as rapidly as humanly possible.'
      ],
      scientificRationale: 'Identifies sub-clinical alertness decrements characteristic of microgravity-induced sleep restriction and cabin atmosphere shifts.'
    },
    4: {
      level: 4,
      name: 'Commander',
      badge: '🛡️ Commander',
      badgeEmoji: '🛡️',
      title: 'Commander Flight Readiness Protocol',
      description: 'Extended vigilance session under tight visual control mimicking spacecraft docking alerts.',
      protocolCode: 'PVT-L4-CMD',
      trialCount: 15,
      timingSummary: '15 trials • 2.0–9.0s ISI • ~100s duration',
      instructions: [
        'Flight commander operational readiness certification protocol.',
        'Requires prolonged steady visual gaze on a micro-reticle.',
        'Lapses (>500ms) directly decrement commander operational certification score.',
        'Keep finger poised over input key or screen.'
      ],
      scientificRationale: 'Calibrates critical response capability required during manual spacecraft trajectory corrections and docking maneuvers.'
    },
    5: {
      level: 5,
      name: 'Deep Space',
      badge: '🌌 Deep Space',
      badgeEmoji: '🌌',
      title: 'Deep Space Full Vigilance Battery',
      description: 'Comprehensive 20-trial deep space vigilance endurance battery matching NASA ISS standards.',
      protocolCode: 'PVT-L5-DEEPSPACE',
      trialCount: 20,
      timingSummary: '20 trials • 2.0–10.0s ISI • ~140s duration',
      instructions: [
        'Full sustained psychomotor vigilance battery.',
        'Long inter-stimulus intervals (up to 10 seconds) designed to detect transient attentional collapse.',
        'Do not look away from the display until all 20 trials conclude.',
        'Every single millisecond counts toward your crew readiness index.'
      ],
      scientificRationale: 'Clinical gold standard for detecting chronic circadian desynchrony and neuro-cognitive fatigue during long-duration deep space transits.'
    }
  },

  NBACK: {
    1: {
      level: 1,
      name: 'Cadet',
      badge: '🎖️ Cadet',
      badgeEmoji: '🎖️',
      title: '1-Back Spatial Working Memory',
      description: 'Identify when the illuminated node matches the spatial position directly prior (1 step back).',
      protocolCode: 'NBACK-L1-CADET',
      trialCount: 12,
      timingSummary: '12 trials • 1-Back • 2000ms ISI',
      instructions: [
        'Watch the 3×3 telemetry grid as nodes illuminate one by one.',
        'Tap MATCH or press SPACE if the current active node is in the EXACT SAME grid position as the IMMEDIATE PREVIOUS node (1 step back).',
        'If the position is different, do NOT tap.',
        'The first trial cannot have a match.'
      ],
      scientificRationale: 'Assesses foundational working memory holding and comparison capacity in short-term buffer storage.'
    },
    2: {
      level: 2,
      name: 'Pilot',
      badge: '🚀 Pilot',
      badgeEmoji: '🚀',
      title: '2-Back Spatial Working Memory',
      description: 'Respond when the illuminated node matches the position shown 2 steps earlier.',
      protocolCode: 'NBACK-L2-PILOT',
      trialCount: 15,
      timingSummary: '15 trials • 2-Back • 1800ms ISI',
      instructions: [
        'Observe the sequence of illuminated grid cells.',
        'Tap MATCH or press SPACE if the current position matches the position from TWO steps ago (2-Back).',
        'Ignore the immediately preceding node (1-Back distractor).',
        'Maintain a continuous rolling queue of the last two positions in your mind.'
      ],
      scientificRationale: 'Engages frontoparietal working memory networks responsible for dynamic continuous updating of spatial vectors.'
    },
    3: {
      level: 3,
      name: 'Specialist',
      badge: '🔬 Specialist',
      badgeEmoji: '🔬',
      title: '2-Back Accelerated Cognitive Load',
      description: 'Rapid 2-Back task with compressed presentation speed and high distractor density.',
      protocolCode: 'NBACK-L3-SPEC',
      trialCount: 18,
      timingSummary: '18 trials • 2-Back Accelerated • 1300ms ISI',
      instructions: [
        'Accelerated stimulus presentation rate.',
        'Each node illuminates briefly; react swiftly before the next node appears.',
        'Identify 2-Back spatial matches while updating under time pressure.',
        'False alarms heavily impact your signal sensitivity d-prime.'
      ],
      scientificRationale: 'Measures executive processing speed under cognitive stress and rapid information inflow.'
    },
    4: {
      level: 4,
      name: 'Commander',
      badge: '🛡️ Commander',
      badgeEmoji: '🛡️',
      title: '3-Back Spatial High-Capacity Task',
      description: 'Demanding 3-Back task requiring retention and mental updating across three sequential positions.',
      protocolCode: 'NBACK-L4-CMD',
      trialCount: 20,
      timingSummary: '20 trials • 3-Back • 1800ms ISI',
      instructions: [
        'Advanced executive working memory challenge: 3-Back.',
        'Tap MATCH or press SPACE if the active cell matches the cell from THREE steps prior.',
        'You must continuously track: [Oldest Match Candidate] -> [Previous] -> [Most Recent].',
        'Avoid responding to 1-Back or 2-Back lure distractors.'
      ],
      scientificRationale: 'Engages high-order dorsolateral prefrontal cortex operations essential for complex multi-step navigation and systems management.'
    },
    5: {
      level: 5,
      name: 'Deep Space',
      badge: '🌌 Deep Space',
      badgeEmoji: '🌌',
      title: '3-Back Dual Spatial-Verbal Battery',
      description: 'Combined dual stimulus paradigm presenting both spatial coordinates and telemetry callsigns.',
      protocolCode: 'NBACK-L5-DEEPSPACE',
      trialCount: 22,
      timingSummary: '22 trials • 3-Back Spatial-Verbal • 1800ms ISI',
      instructions: [
        'Ultimate astronaut working memory benchmark.',
        'Nodes illuminate displaying orbital letters (e.g., A, B, C, X).',
        'Tap MATCH if EITHER the spatial grid position OR the displayed letter matches the stimulus from 3 steps ago.',
        'Requires divided working memory bandwidth across both spatial and verbal cognitive domains.'
      ],
      scientificRationale: 'Detects cross-domain cognitive overload and measures resilience of multimodal working memory buffers during high-stakes space maneuvers.'
    }
  },

  CPT: {
    1: {
      level: 1,
      name: 'Cadet',
      badge: '🎖️ Cadet',
      badgeEmoji: '🎖️',
      title: 'Cadet Simple Go/No-Go Paradigm',
      description: 'Respond rapidly to the target letter "X" while withholding response for all non-targets.',
      protocolCode: 'CPT-L1-CADET',
      trialCount: 15,
      timingSummary: '15 trials • Go on "X" • 1500ms window',
      instructions: [
        'Letters will flash sequentially in the central optical console.',
        'GO RULE: Tap RESPOND or press SPACE whenever the letter "X" appears.',
        'NO-GO RULE: For ANY other letter (A, B, C, D, L, M, O), DO NOT TAP.',
        'Commission errors (tapping on non-targets) reduce your inhibitory control rating.'
      ],
      scientificRationale: 'Measures basic motor response inhibition and selectivity of attention under low cognitive complexity.'
    },
    2: {
      level: 2,
      name: 'Pilot',
      badge: '🚀 Pilot',
      badgeEmoji: '🚀',
      title: 'Pilot Diverse Distractor Protocol',
      description: 'Detect target "X" embedded among 16 diverse distractor letters with variable timing.',
      protocolCode: 'CPT-L2-PILOT',
      trialCount: 20,
      timingSummary: '20 trials • Diverse Distractors • 1200ms window',
      instructions: [
        'Target remains letter "X".',
        'Distractor variety is significantly increased with random timing.',
        'Do not let false anticipation trigger an accidental press on visually similar letters (e.g., K, Y, Z).',
        'Maintain steady, calibrated response tempo.'
      ],
      scientificRationale: 'Evaluates selective visual filtering and attentional stability when confronted with high perceptual noise.'
    },
    3: {
      level: 3,
      name: 'Specialist',
      badge: '🔬 Specialist',
      badgeEmoji: '🔬',
      title: 'A-X Target Discrimination Protocol',
      description: 'Classic NASA A-X CPT: Respond to "X" ONLY IF it is immediately preceded by the letter "A".',
      protocolCode: 'CPT-L3-SPEC',
      trialCount: 24,
      timingSummary: '24 trials • A-X Sequence • 1200ms window',
      instructions: [
        'DISCRIMINATION RULE: Tap RESPOND or press SPACE when you see "X", BUT ONLY IF the immediately preceding letter was "A".',
        'If "X" appears after any other letter (e.g., B-X, M-X), it is a NO-GO trap! Do NOT tap.',
        'If "A" appears, do NOT tap yet—it is merely the priming cue.',
        'Only tap on the paired sequence: [ A ] followed by [ X ].'
      ],
      scientificRationale: 'The clinical gold-standard test of context processing and proactive cognitive control in prefrontal circuits.'
    },
    4: {
      level: 4,
      name: 'Commander',
      badge: '🛡️ Commander',
      badgeEmoji: '🛡️',
      title: 'Commander Conditional Vowel Shift',
      description: 'Respond to any VOWEL (A, E, I, O, U) UNLESS it is preceded by an inhibition cue letter "Z".',
      protocolCode: 'CPT-L4-CMD',
      trialCount: 26,
      timingSummary: '26 trials • Conditional Vowel Shift • 1100ms window',
      instructions: [
        'GO RULE: Tap RESPOND on ANY vowel (A, E, I, O, U).',
        'INHIBITION OVERRIDE: If the letter immediately prior was "Z", the vowel is CANCELLED! Do NOT tap.',
        'Consonants are always No-Go (do not tap).',
        'Requires constant state-switching between category recognition and contextual override.'
      ],
      scientificRationale: 'Assesses executive flexibility and inhibitory override under shifting mission telemetry contexts.'
    },
    5: {
      level: 5,
      name: 'Deep Space',
      badge: '🌌 Deep Space',
      badgeEmoji: '🌌',
      title: 'Deep Space High-Velocity Vigilance Battery',
      description: 'Rapid-fire 30-trial sustained attention challenge with high distractor density and fatigue tracking.',
      protocolCode: 'CPT-L5-DEEPSPACE',
      trialCount: 30,
      timingSummary: '30 trials • Rapid 800ms presentation • 1st vs 2nd half tracking',
      instructions: [
        'High-velocity sustained attention assessment.',
        'Stimuli appear in rapid 800 ms windows.',
        'Respond to target letter "X" preceded by "A", or direct target symbol "⚡".',
        'Monitors your vigilance decrement—detecting if your response speed and accuracy drop between the first and second half of the run.'
      ],
      scientificRationale: 'Detects vigilance decrement and cognitive stamina fade over prolonged high-tempo operational shifts.'
    }
  }
};
