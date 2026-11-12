/**
 * ASTRA Health - N-Back Working Memory Assessment Game
 * Interactive 3x3 spatial grid task with 1-Back, 2-Back, and 3-Back spatial & dual verbal levels.
 * Implements Signal Detection Theory (d') with Hautus log-linear correction.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Brain, CheckCircle2, RotateCcw, AlertCircle, Sparkles, Volume2, ArrowRight } from 'lucide-react';
import { NeuroLevelConfig, RawTrialData, NBackMetrics } from '../../../types/neurolab';
import { calculateDPrime, calculateMean, classifyAccuracyReadiness } from '../../../utils/cognitiveMath';
import { spaceAudio } from '../../../utils/spaceAudio';

interface NBackAssessmentGameProps {
  levelConfig: NeuroLevelConfig;
  onFinish: (metrics: NBackMetrics, rawTrials: RawTrialData[], durationSeconds: number) => void;
  onAbort: () => void;
}

type NBackPhase = 'INSTRUCTIONS' | 'TRIAL_ACTIVE' | 'ISI_REST' | 'COMPLETED';

interface SequenceItem {
  spatialIndex: number; // 0 to 8
  letter?: string; // For level 5
  isTarget: boolean;
}

export const NBackAssessmentGame: React.FC<NBackAssessmentGameProps> = ({
  levelConfig,
  onFinish,
  onAbort,
}) => {
  const [phase, setPhase] = useState<NBackPhase>('INSTRUCTIONS');
  const [currentTrialIdx, setCurrentTrialIdx] = useState<number>(0);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [hasRespondedThisTrial, setHasRespondedThisTrial] = useState<boolean>(false);
  const [feedbackFlash, setFeedbackFlash] = useState<'HIT' | 'FALSE_ALARM' | null>(null);

  // Pre-generated controlled sequence
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [rawTrials, setRawTrials] = useState<RawTrialData[]>([]);

  // Timing refs
  const trialTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const trialStartTimeRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);
  const respondedRef = useRef<boolean>(false);
  const responseTimeRef = useRef<number | null>(null);

  const nValue = levelConfig.level === 1 ? 1 : levelConfig.level <= 3 ? 2 : 3;

  // Generate sequence with controlled ~35% targets
  const generateSequence = useCallback(() => {
    const total = levelConfig.trialCount;
    const items: SequenceItem[] = [];
    const letters = ['A', 'B', 'C', 'D', 'X', 'Y', 'Z'];

    for (let i = 0; i < total; i++) {
      let isTarget = false;
      let spatialIndex = Math.floor(Math.random() * 9);
      let letter = letters[Math.floor(Math.random() * letters.length)];

      // First N items cannot be targets
      if (i >= nValue) {
        // Enforce ~35% target rate
        const currentTargetCount = items.filter((it) => it.isTarget).length;
        const targetQuota = Math.round(total * 0.35);

        const shouldForceTarget = Math.random() < 0.38 && currentTargetCount < targetQuota;

        if (shouldForceTarget) {
          isTarget = true;
          const matchTarget = items[i - nValue];
          if (levelConfig.level === 5) {
            // Level 5: Either match position or letter
            if (Math.random() > 0.5) {
              spatialIndex = matchTarget.spatialIndex;
            } else {
              letter = matchTarget.letter || 'X';
            }
          } else {
            spatialIndex = matchTarget.spatialIndex;
          }
        } else {
          // Ensure it is NOT an accidental target
          const prev = items[i - nValue];
          if (spatialIndex === prev.spatialIndex) {
            spatialIndex = (spatialIndex + 1) % 9;
          }
        }
      }

      items.push({ spatialIndex, letter, isTarget });
    }

    return items;
  }, [levelConfig, nValue]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (trialTimeoutRef.current) clearTimeout(trialTimeoutRef.current);
      if (isiTimeoutRef.current) clearTimeout(isiTimeoutRef.current);
    };
  }, []);

  // Run a trial
  const runTrial = (trialIndex: number, currentSeq: SequenceItem[]) => {
    if (trialIndex >= currentSeq.length) {
      finishAssessment(currentSeq);
      return;
    }

    const item = currentSeq[trialIndex];
    respondedRef.current = false;
    responseTimeRef.current = null;
    setHasRespondedThisTrial(false);
    setFeedbackFlash(null);

    // Present stimulus
    setCurrentTrialIdx(trialIndex);
    setActiveCell(item.spatialIndex);
    setActiveLetter(item.letter || null);
    setPhase('TRIAL_ACTIVE');
    trialStartTimeRef.current = performance.now();
    spaceAudio.playQuindar();

    // Stimulus duration (550ms for presentation)
    const stimulusDuration = 550;

    // Total trial duration (e.g. 1300ms for Level 3, 1800ms for Level 2/4/5, 2000ms for Level 1)
    let totalWindow = 2000;
    if (levelConfig.level === 3) totalWindow = 1300;
    else if (levelConfig.level === 2) totalWindow = 1800;
    else if (levelConfig.level >= 4) totalWindow = 1800;

    if (trialTimeoutRef.current) clearTimeout(trialTimeoutRef.current);

    // After stimulusDuration, hide active highlight but keep response window open
    trialTimeoutRef.current = setTimeout(() => {
      setActiveCell(null);
      setActiveLetter(null);
      setPhase('ISI_REST');

      // Schedule transition to next trial after remainder of window
      const remainingTime = Math.max(100, totalWindow - stimulusDuration);

      if (isiTimeoutRef.current) clearTimeout(isiTimeoutRef.current);
      isiTimeoutRef.current = setTimeout(() => {
        // Record final verdict for trial
        evaluateTrialCompletion(trialIndex, item);
        runTrial(trialIndex + 1, currentSeq);
      }, remainingTime);
    }, stimulusDuration);
  };

  // Evaluate trial response at end of trial window
  const evaluateTrialCompletion = (trialIndex: number, item: SequenceItem) => {
    const userDidRespond = respondedRef.current;
    const rt = responseTimeRef.current;
    const isTarget = item.isTarget;

    let feedbackType: RawTrialData['feedbackType'] = 'CORRECT_REJECTION';
    let isCorrect = false;

    if (isTarget && userDidRespond) {
      feedbackType = 'CORRECT_HIT';
      isCorrect = true;
    } else if (isTarget && !userDidRespond) {
      feedbackType = 'OMISSION';
      isCorrect = false;
    } else if (!isTarget && userDidRespond) {
      feedbackType = 'COMMISSION';
      isCorrect = false;
    } else {
      feedbackType = 'CORRECT_REJECTION';
      isCorrect = true;
    }

    const trialData: RawTrialData = {
      trialIndex: trialIndex + 1,
      stimulus: `NODE_${item.spatialIndex}${item.letter ? `_${item.letter}` : ''}`,
      spatialIndex: item.spatialIndex,
      isTarget,
      userResponded: userDidRespond,
      reactionTimeMs: rt,
      isCorrect,
      feedbackType,
      timestamp: Date.now(),
    };

    setRawTrials((prev) => [...prev, trialData]);
  };

  // User triggers response (Spacebar or Match button)
  const handleUserMatchResponse = () => {
    if (respondedRef.current || phase === 'INSTRUCTIONS' || phase === 'COMPLETED') return;

    respondedRef.current = true;
    const now = performance.now();
    const rt = Math.round(now - trialStartTimeRef.current);
    responseTimeRef.current = rt;
    setHasRespondedThisTrial(true);

    const currentItem = sequence[currentTrialIdx];
    if (currentItem?.isTarget) {
      spaceAudio.playExecute();
      setFeedbackFlash('HIT');
    } else {
      spaceAudio.playWarning();
      setFeedbackFlash('FALSE_ALARM');
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleUserMatchResponse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, currentTrialIdx, sequence]);

  // Start assessment
  const startAssessment = () => {
    const newSeq = generateSequence();
    setSequence(newSeq);
    setRawTrials([]);
    sessionStartTimeRef.current = Date.now();
    runTrial(0, newSeq);
  };

  // Finish assessment
  const finishAssessment = (completedSeq: SequenceItem[]) => {
    setPhase('COMPLETED');
    const totalDurationSec = Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000));

    setRawTrials((currentRaw) => {
      const hits = currentRaw.filter((t) => t.feedbackType === 'CORRECT_HIT').length;
      const omissions = currentRaw.filter((t) => t.feedbackType === 'OMISSION').length;
      const falseAlarms = currentRaw.filter((t) => t.feedbackType === 'COMMISSION').length;
      const correctRejections = currentRaw.filter((t) => t.feedbackType === 'CORRECT_REJECTION').length;

      const totalTargets = hits + omissions;
      const totalNonTargets = falseAlarms + correctRejections;
      const totalTrials = currentRaw.length;

      const accuracy = totalTrials > 0 ? Math.round(((hits + correctRejections) / totalTrials) * 100) : 0;

      const hitRts = currentRaw
        .filter((t) => t.feedbackType === 'CORRECT_HIT' && t.reactionTimeMs !== null)
        .map((t) => t.reactionTimeMs as number);
      const meanLatency = calculateMean(hitRts) || 450;

      const dPrime = calculateDPrime(hits, totalTargets, falseAlarms, totalNonTargets);
      const rating = classifyAccuracyReadiness(accuracy, dPrime);

      const metrics: NBackMetrics = {
        accuracyPercent: accuracy,
        correctHits: hits,
        missedTargets: omissions,
        falseAlarms,
        correctRejections,
        meanLatencyMs: meanLatency,
        dPrime,
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
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-700/50 text-cyan-400">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{levelConfig.title}</span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-slate-800 text-cyan-400 border border-cyan-500/30 font-bold">
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
              <strong className="text-cyan-400 font-bold">
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
            className="bg-gradient-to-r from-cyan-500 to-sky-400 h-full transition-all duration-300"
            style={{ width: `${(Math.min(currentTrialIdx, levelConfig.trialCount) / levelConfig.trialCount) * 100}%` }}
          />
        </div>
      )}

      {/* Main Testing Canvas */}
      {phase === 'INSTRUCTIONS' ? (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-center font-mono space-y-5">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">
              PROTOCOL BRIEFING: {levelConfig.name.toUpperCase()} ({nValue}-BACK)
            </h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              {levelConfig.description}
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-2.5 text-xs text-slate-300 font-sans">
            <strong className="font-mono text-cyan-400 uppercase text-[11px] block">Test Protocol Rules:</strong>
            <ul className="space-y-1.5 list-disc list-inside">
              {levelConfig.instructions.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ul>
          </div>

          <div className="pt-2">
            <button
              onClick={startAssessment}
              className="px-8 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-black text-sm transition shadow-lg shadow-cyan-600/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>START {nValue}-BACK TEST</span>
            </button>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Press SPACEBAR or click the MATCH button when you detect an N-Back match.
            </div>
          </div>
        </div>
      ) : (
        /* Interactive 3x3 Spatial Grid Arena */
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-between min-h-[380px] shadow-2xl relative select-none">
          {/* Target rule reminder banner */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span>RULE: Match cell from </span>
            <strong className="text-cyan-400 font-bold">{nValue} STEPS AGO</strong>
          </div>

          {/* 3x3 Spatial Grid */}
          <div className="grid grid-cols-3 gap-3 w-64 h-64 sm:w-72 sm:h-72 my-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
              const isActive = activeCell === index;
              return (
                <div
                  key={index}
                  className={`rounded-2xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all duration-150 ${
                    isActive
                      ? 'bg-cyan-400 border-white text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.9)] scale-105'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-700'
                  }`}
                >
                  {isActive && activeLetter ? activeLetter : ''}
                </div>
              );
            })}
          </div>

          {/* User Response Control Bar */}
          <div className="w-full max-w-sm flex flex-col items-center gap-2">
            <button
              onClick={handleUserMatchResponse}
              disabled={hasRespondedThisTrial}
              className={`w-full py-3.5 rounded-xl font-mono font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-95 ${
                hasRespondedThisTrial
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/30 border border-cyan-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{hasRespondedThisTrial ? 'MATCH RECORDED' : `MATCH TARGET (${nValue}-BACK)`}</span>
            </button>
            <div className="text-[10px] font-mono text-slate-500">
              SPACEBAR = TRIGGER MATCH • DO NOT PRESS IF DIFFERENT
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
              {feedbackFlash === 'HIT' ? '✓ TARGET HIT' : '✗ FALSE ALARM'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
