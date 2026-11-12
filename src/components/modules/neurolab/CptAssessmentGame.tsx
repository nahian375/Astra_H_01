/**
 * ASTRA Health - CPT (Continuous Performance Test) Assessment Game
 * Sustained attention & response inhibition battery (Go/No-Go and A-X protocols).
 * Measures commission errors, omission errors, reaction-time variability, and vigilance decrement.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Target, CheckCircle2, RotateCcw, AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';
import { NeuroLevelConfig, RawTrialData, CptMetrics } from '../../../types/neurolab';
import { calculateMean, calculateStandardDeviation, classifyAccuracyReadiness } from '../../../utils/cognitiveMath';
import { spaceAudio } from '../../../utils/spaceAudio';

interface CptAssessmentGameProps {
  levelConfig: NeuroLevelConfig;
  onFinish: (metrics: CptMetrics, rawTrials: RawTrialData[], durationSeconds: number) => void;
  onAbort: () => void;
}

type CptPhase = 'INSTRUCTIONS' | 'TRIAL_ACTIVE' | 'ISI_REST' | 'COMPLETED';

interface CptTrialItem {
  stimulus: string;
  isGoTarget: boolean;
  precedingStimulus?: string;
}

export const CptAssessmentGame: React.FC<CptAssessmentGameProps> = ({
  levelConfig,
  onFinish,
  onAbort,
}) => {
  const [phase, setPhase] = useState<CptPhase>('INSTRUCTIONS');
  const [currentTrialIdx, setCurrentTrialIdx] = useState<number>(0);
  const [displayedStimulus, setDisplayedStimulus] = useState<string | null>(null);
  const [hasRespondedThisTrial, setHasRespondedThisTrial] = useState<boolean>(false);
  const [feedbackFlash, setFeedbackFlash] = useState<'HIT' | 'COMMISSION' | null>(null);

  // Pre-generated sequence
  const [trialsSequence, setTrialsSequence] = useState<CptTrialItem[]>([]);
  const [rawTrials, setRawTrials] = useState<RawTrialData[]>([]);

  // Timing refs
  const trialTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stimulusStartTimeRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);
  const userRespondedRef = useRef<boolean>(false);
  const userRtRef = useRef<number | null>(null);

  // Generate controlled CPT stimulus sequence based on Level rule
  const generateCptSequence = useCallback(() => {
    const total = levelConfig.trialCount;
    const items: CptTrialItem[] = [];
    const lvl = levelConfig.level;

    const alphabetDistractors = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T'];

    if (lvl === 1) {
      // Level 1: Go on 'X', simple distractors (A, B, C, D, L, M)
      const distractors = ['A', 'B', 'C', 'D', 'L', 'M', 'O'];
      const targetCount = Math.round(total * 0.35); // ~35% targets
      for (let i = 0; i < total; i++) {
        const currentTargetCount = items.filter((it) => it.isGoTarget).length;
        const isTarget = Math.random() < 0.4 && currentTargetCount < targetCount;
        items.push({
          stimulus: isTarget ? 'X' : distractors[Math.floor(Math.random() * distractors.length)],
          isGoTarget: isTarget,
        });
      }
    } else if (lvl === 2) {
      // Level 2: Go on 'X', 16 diverse distractors
      const targetCount = Math.round(total * 0.35);
      for (let i = 0; i < total; i++) {
        const currentTargetCount = items.filter((it) => it.isGoTarget).length;
        const isTarget = Math.random() < 0.4 && currentTargetCount < targetCount;
        items.push({
          stimulus: isTarget ? 'X' : alphabetDistractors[Math.floor(Math.random() * alphabetDistractors.length)],
          isGoTarget: isTarget,
        });
      }
    } else if (lvl === 3) {
      // Level 3: A-X continuous task: Go on 'X' ONLY IF preceded immediately by 'A'
      // Requires paired cues!
      const targetPairs = Math.round(total * 0.3); // ~7 target pairs
      let i = 0;
      while (i < total) {
        const canInsertPair = i <= total - 2;
        const currentTargets = items.filter((it) => it.isGoTarget).length;
        if (canInsertPair && currentTargets < targetPairs && Math.random() < 0.5) {
          // Insert [A] (No-Go cue) then [X] (Go target!)
          items.push({ stimulus: 'A', isGoTarget: false });
          items.push({ stimulus: 'X', isGoTarget: true, precedingStimulus: 'A' });
          i += 2;
        } else {
          // Distractor: could be B-X (trap!), or random letter
          if (Math.random() < 0.25) {
            // Trap: 'X' without 'A' (e.g. B-X)
            const trapLetter = alphabetDistractors[Math.floor(Math.random() * alphabetDistractors.length)];
            items.push({ stimulus: 'X', isGoTarget: false, precedingStimulus: trapLetter });
          } else {
            const randomLetter = alphabetDistractors[Math.floor(Math.random() * alphabetDistractors.length)];
            items.push({ stimulus: randomLetter, isGoTarget: false });
          }
          i += 1;
        }
      }
    } else if (lvl === 4) {
      // Level 4: Vowel Shift. Go on vowels (A, E, I, O, U) UNLESS preceded by 'Z' (Inhibition cue)
      const vowels = ['A', 'E', 'I', 'O', 'U'];
      for (let i = 0; i < total; i++) {
        const prev = i > 0 ? items[i - 1].stimulus : '';
        const shouldBeZTrap = prev === 'Z' || (Math.random() < 0.2 && i < total - 1);
        if (shouldBeZTrap && prev !== 'Z') {
          items.push({ stimulus: 'Z', isGoTarget: false });
        } else if (prev === 'Z') {
          // Preceded by Z! Even though vowel, it is CANCELLED (No-Go)
          const vowel = vowels[Math.floor(Math.random() * vowels.length)];
          items.push({ stimulus: vowel, isGoTarget: false, precedingStimulus: 'Z' });
        } else {
          const isVowel = Math.random() < 0.4;
          if (isVowel) {
            const vowel = vowels[Math.floor(Math.random() * vowels.length)];
            items.push({ stimulus: vowel, isGoTarget: true });
          } else {
            const consonant = alphabetDistractors[Math.floor(Math.random() * alphabetDistractors.length)];
            items.push({ stimulus: consonant, isGoTarget: false });
          }
        }
      }
    } else {
      // Level 5: High-velocity Deep Space. Go on 'X' or '⚡'
      const targetSymbols = ['X', '⚡'];
      const targetCount = Math.round(total * 0.35);
      for (let i = 0; i < total; i++) {
        const currentTargetCount = items.filter((it) => it.isGoTarget).length;
        const isTarget = Math.random() < 0.4 && currentTargetCount < targetCount;
        items.push({
          stimulus: isTarget
            ? targetSymbols[Math.floor(Math.random() * targetSymbols.length)]
            : alphabetDistractors[Math.floor(Math.random() * alphabetDistractors.length)],
          isGoTarget: isTarget,
        });
      }
    }

    return items.slice(0, total);
  }, [levelConfig]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (trialTimeoutRef.current) clearTimeout(trialTimeoutRef.current);
      if (isiTimeoutRef.current) clearTimeout(isiTimeoutRef.current);
    };
  }, []);

  // Run a trial
  const runCptTrial = (trialIndex: number, currentSeq: CptTrialItem[]) => {
    if (trialIndex >= currentSeq.length) {
      finishAssessment(currentSeq);
      return;
    }

    const item = currentSeq[trialIndex];
    userRespondedRef.current = false;
    userRtRef.current = null;
    setHasRespondedThisTrial(false);
    setFeedbackFlash(null);

    setCurrentTrialIdx(trialIndex);
    setDisplayedStimulus(item.stimulus);
    setPhase('TRIAL_ACTIVE');
    stimulusStartTimeRef.current = performance.now();
    spaceAudio.playQuindar();

    // Stimulus display duration
    const displayDurationMs = levelConfig.level === 5 ? 450 : 600;

    // Total trial window (e.g. 800ms for Level 5, 1100ms for Level 4, 1200ms for Level 2/3, 1500ms for Level 1)
    let totalWindow = 1500;
    if (levelConfig.level === 5) totalWindow = 800;
    else if (levelConfig.level === 4) totalWindow = 1100;
    else if (levelConfig.level >= 2) totalWindow = 1200;

    if (trialTimeoutRef.current) clearTimeout(trialTimeoutRef.current);

    trialTimeoutRef.current = setTimeout(() => {
      setDisplayedStimulus(null);
      setPhase('ISI_REST');

      const remainingTime = Math.max(100, totalWindow - displayDurationMs);

      if (isiTimeoutRef.current) clearTimeout(isiTimeoutRef.current);
      isiTimeoutRef.current = setTimeout(() => {
        evaluateCptTrial(trialIndex, item);
        runCptTrial(trialIndex + 1, currentSeq);
      }, remainingTime);
    }, displayDurationMs);
  };

  // Evaluate single trial outcome
  const evaluateCptTrial = (trialIndex: number, item: CptTrialItem) => {
    const userResponded = userRespondedRef.current;
    const rt = userRtRef.current;
    const isTarget = item.isGoTarget;

    let feedbackType: RawTrialData['feedbackType'] = 'CORRECT_REJECTION';
    let isCorrect = false;

    if (isTarget && userResponded) {
      feedbackType = 'CORRECT_HIT';
      isCorrect = true;
    } else if (isTarget && !userResponded) {
      feedbackType = 'OMISSION';
      isCorrect = false;
    } else if (!isTarget && userResponded) {
      feedbackType = 'COMMISSION';
      isCorrect = false;
    } else {
      feedbackType = 'CORRECT_REJECTION';
      isCorrect = true;
    }

    const trialData: RawTrialData = {
      trialIndex: trialIndex + 1,
      stimulus: item.stimulus,
      isTarget,
      userResponded,
      reactionTimeMs: rt,
      isCorrect,
      feedbackType,
      timestamp: Date.now(),
    };

    setRawTrials((prev) => [...prev, trialData]);
  };

  // User input (press Go)
  const handleUserGoResponse = () => {
    if (userRespondedRef.current || phase === 'INSTRUCTIONS' || phase === 'COMPLETED') return;

    userRespondedRef.current = true;
    const now = performance.now();
    const rt = Math.round(now - stimulusStartTimeRef.current);
    userRtRef.current = rt;
    setHasRespondedThisTrial(true);

    const currentItem = trialsSequence[currentTrialIdx];
    if (currentItem?.isGoTarget) {
      spaceAudio.playExecute();
      setFeedbackFlash('HIT');
    } else {
      spaceAudio.playWarning();
      setFeedbackFlash('COMMISSION');
    }
  };

  // Keyboard shortcut listener (Spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleUserGoResponse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, currentTrialIdx, trialsSequence]);

  // Start test
  const startAssessment = () => {
    const newSeq = generateCptSequence();
    setTrialsSequence(newSeq);
    setRawTrials([]);
    sessionStartTimeRef.current = Date.now();
    runCptTrial(0, newSeq);
  };

  // Finish assessment and compute complete metrics
  const finishAssessment = (completedSeq: CptTrialItem[]) => {
    setPhase('COMPLETED');
    const totalDurationSec = Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000));

    setRawTrials((currentRaw) => {
      const hits = currentRaw.filter((t) => t.feedbackType === 'CORRECT_HIT').length;
      const omissions = currentRaw.filter((t) => t.feedbackType === 'OMISSION').length;
      const commissions = currentRaw.filter((t) => t.feedbackType === 'COMMISSION').length;
      const correctRejections = currentRaw.filter((t) => t.feedbackType === 'CORRECT_REJECTION').length;

      const totalTrials = currentRaw.length;
      const accuracy = totalTrials > 0 ? Math.round(((hits + correctRejections) / totalTrials) * 100) : 0;

      const hitRts = currentRaw
        .filter((t) => t.feedbackType === 'CORRECT_HIT' && t.reactionTimeMs !== null)
        .map((t) => t.reactionTimeMs as number);

      const meanHitRt = calculateMean(hitRts) || 400;
      const rtVariability = calculateStandardDeviation(hitRts) || 45;

      // First-half vs second-half vigilance decrement comparison
      const midPoint = Math.floor(totalTrials / 2);
      const firstHalf = currentRaw.slice(0, midPoint);
      const secondHalf = currentRaw.slice(midPoint);

      const firstHalfAcc = firstHalf.length > 0 ? Math.round((firstHalf.filter((t) => t.isCorrect).length / firstHalf.length) * 100) : 100;
      const secondHalfAcc = secondHalf.length > 0 ? Math.round((secondHalf.filter((t) => t.isCorrect).length / secondHalf.length) * 100) : 100;
      const vigilanceDecrement = firstHalfAcc - secondHalfAcc;

      const rating = classifyAccuracyReadiness(accuracy, accuracy > 85 ? 3.0 : 1.5);

      const metrics: CptMetrics = {
        accuracyPercent: accuracy,
        commissionErrors: commissions,
        omissionErrors: omissions,
        correctHits: hits,
        correctRejections,
        meanHitRtMs: meanHitRt,
        rtVariabilityMs: rtVariability,
        firstHalfAccuracy: firstHalfAcc,
        secondHalfAccuracy: secondHalfAcc,
        vigilanceDecrementPercent: vigilanceDecrement,
        totalTrials,
        readinessRating: rating,
      };

      onFinish(metrics, currentRaw, totalDurationSec);
      return currentRaw;
    });
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto space-y-4">
      {/* Top Test Header */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700/50 text-emerald-400">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{levelConfig.title}</span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-slate-800 text-emerald-400 border border-emerald-500/30 font-bold">
                {levelConfig.badge}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans">{levelConfig.timingSummary}</p>
          </div>
        </div>

        {phase !== 'INSTRUCTIONS' && (
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400">TRIAL: </span>
              <strong className="text-emerald-400 font-bold">
                {Math.min(currentTrialIdx + 1, levelConfig.trialCount)} / {levelConfig.trialCount}
              </strong>
            </div>
            <button
              onClick={onAbort}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
            >
              ABORT
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {phase !== 'INSTRUCTIONS' && (
        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
            style={{ width: `${(Math.min(currentTrialIdx, levelConfig.trialCount) / levelConfig.trialCount) * 100}%` }}
          />
        </div>
      )}

      {/* Main Testing Canvas */}
      {phase === 'INSTRUCTIONS' ? (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-center font-mono space-y-5">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">
              PROTOCOL BRIEFING: {levelConfig.name.toUpperCase()} (CPT)
            </h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              {levelConfig.description}
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-2.5 text-xs text-slate-300 font-sans">
            <strong className="font-mono text-emerald-400 uppercase text-[11px] block">Test Protocol Rules:</strong>
            <ul className="space-y-1.5 list-disc list-inside">
              {levelConfig.instructions.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ul>
          </div>

          <div className="pt-2">
            <button
              onClick={startAssessment}
              className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-black text-sm transition shadow-lg shadow-emerald-600/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>START CONTINUOUS ATTENTION TEST</span>
            </button>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Press SPACEBAR or click RESPOND when the Go rule is satisfied. Withhold for No-Go.
            </div>
          </div>
        </div>
      ) : (
        /* Active CPT Optical Console */
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-between min-h-[380px] shadow-2xl relative select-none">
          {/* Target rule reminder banner */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span>RULE: </span>
            <strong className="text-emerald-400 font-bold">
              {levelConfig.level === 1 && 'GO on "X" • NO-GO on others'}
              {levelConfig.level === 2 && 'GO on "X" among diverse distractors'}
              {levelConfig.level === 3 && 'GO on "X" ONLY IF preceded by "A"'}
              {levelConfig.level === 4 && 'GO on VOWEL unless preceded by "Z"'}
              {levelConfig.level === 5 && 'GO on "X" or "⚡" • RAPID STREAM'}
            </strong>
          </div>

          {/* Central Optical Display Chamber */}
          <div className="flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-slate-900/90 border-2 border-slate-800 my-4 shadow-inner relative">
            {displayedStimulus ? (
              <span className="font-mono font-black text-7xl sm:text-8xl text-emerald-400 drop-shadow-[0_0_30px_rgba(52,211,153,0.8)] animate-scale-in">
                {displayedStimulus}
              </span>
            ) : (
              <span className="font-mono text-slate-700 text-2xl font-bold">+</span>
            )}

            {/* Subtle scanning ring */}
            <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-spin-slow pointer-events-none" />
          </div>

          {/* User Response Control Bar */}
          <div className="w-full max-w-sm flex flex-col items-center gap-2">
            <button
              onClick={handleUserGoResponse}
              disabled={hasRespondedThisTrial}
              className={`w-full py-3.5 rounded-xl font-mono font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-95 ${
                hasRespondedThisTrial
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border border-emerald-400'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>{hasRespondedThisTrial ? 'RESPONSE RECORDED' : 'RESPOND / GO (SPACEBAR)'}</span>
            </button>
            <div className="text-[10px] font-mono text-slate-500">
              SPACEBAR = TRIGGER RESPONSE • WITHHOLD ON NO-GO
            </div>
          </div>

          {/* Instant feedback badge */}
          {feedbackFlash && (
            <div
              className={`absolute top-4 right-4 px-3 py-1 rounded-lg text-xs font-mono font-bold animate-fade-in ${
                feedbackFlash === 'HIT'
                  ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/50'
                  : 'bg-rose-950/90 text-rose-400 border border-rose-500/50'
              }`}
            >
              {feedbackFlash === 'HIT' ? '✓ TARGET HIT' : '✗ COMMISSION ERROR'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
