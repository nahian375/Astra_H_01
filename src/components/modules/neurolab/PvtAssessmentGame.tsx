/**
 * ASTRA Health - PVT (Psychomotor Vigilance Test) Assessment Game
 * High-precision reaction latency test with monotonic performance.now() timing,
 * central fixation point, real-time rolling millisecond counter, lapse & false start detection.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, AlertTriangle, CheckCircle2, Clock, Zap, Info, X, ChevronRight, Activity } from 'lucide-react';
import { NeuroLevelConfig, RawTrialData, PvtMetrics } from '../../../types/neurolab';
import { calculateMean, calculateMedian, calculateFastest10Percent, classifyPvtReadiness } from '../../../utils/cognitiveMath';
import { spaceAudio } from '../../../utils/spaceAudio';

interface PvtAssessmentGameProps {
  levelConfig: NeuroLevelConfig;
  onFinish: (metrics: PvtMetrics, rawTrials: RawTrialData[], durationSeconds: number) => void;
  onAbort: () => void;
}

type TestPhase = 'INSTRUCTIONS' | 'FIXATION' | 'STIMULUS_ACTIVE' | 'FEEDBACK' | 'PAUSED' | 'COMPLETED';

export const PvtAssessmentGame: React.FC<PvtAssessmentGameProps> = ({
  levelConfig,
  onFinish,
  onAbort,
}) => {
  const [phase, setPhase] = useState<TestPhase>('INSTRUCTIONS');
  const [currentTrial, setCurrentTrial] = useState<number>(0);
  const [elapsedDisplayMs, setElapsedDisplayMs] = useState<number>(0);
  const [trialFeedback, setTrialFeedback] = useState<{
    text: string;
    subtext: string;
    type: 'SUCCESS' | 'WARNING' | 'DANGER';
  } | null>(null);

  // Raw trials log
  const [rawTrials, setRawTrials] = useState<RawTrialData[]>([]);

  // High resolution timing refs
  const stimulusStartTimeRef = useRef<number>(0);
  const waitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const isPrematureFlagRef = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Frame loop for live millisecond counter during active stimulus
  const updateLiveCounter = useCallback(() => {
    if (stimulusStartTimeRef.current > 0) {
      const now = performance.now();
      const currentElapsed = Math.round(now - stimulusStartTimeRef.current);
      setElapsedDisplayMs(currentElapsed);

      // Auto-cutoff if no response after 3000ms (marked as maximum lapse)
      if (currentElapsed > 3000) {
        handleResponseTimeout();
        return;
      }
      animationFrameRef.current = requestAnimationFrame(updateLiveCounter);
    }
  }, []);

  // Schedule the next trial with randomized interval
  const scheduleTrialStimulus = useCallback((trialNum: number) => {
    if (trialNum >= levelConfig.trialCount) {
      finishAssessment();
      return;
    }

    setPhase('FIXATION');
    setTrialFeedback(null);
    setElapsedDisplayMs(0);
    isPrematureFlagRef.current = false;

    // Determine interval based on level (2-4s for Cadet up to 2-10s for Deep Space)
    let minDelay = 2000;
    let maxDelay = 4000;
    if (levelConfig.level === 2) maxDelay = 6000;
    if (levelConfig.level === 3) maxDelay = 8000;
    if (levelConfig.level === 4) maxDelay = 9000;
    if (levelConfig.level === 5) maxDelay = 10000;

    const delayMs = minDelay + Math.random() * (maxDelay - minDelay);

    if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);

    waitTimeoutRef.current = setTimeout(() => {
      // Stimulus onset!
      stimulusStartTimeRef.current = performance.now();
      setPhase('STIMULUS_ACTIVE');
      spaceAudio.playExecute();
      animationFrameRef.current = requestAnimationFrame(updateLiveCounter);
    }, delayMs);
  }, [levelConfig, updateLiveCounter]);

  // Handle Response Timeout (3000ms lapse)
  const handleResponseTimeout = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const rt = 3000;
    recordTrial(currentTrial, rt, false, true, false);

    setTrialFeedback({
      text: 'TIMEOUT (LAPSE > 3000ms)',
      subtext: 'No response detected within operational safety window.',
      type: 'DANGER',
    });
    setPhase('FEEDBACK');
    advanceToNextTrial(currentTrial + 1);
  };

  // Record a trial's result into raw array
  const recordTrial = (
    trialIdx: number,
    rt: number | null,
    isFalseStart: boolean,
    isLapse: boolean,
    isPremature: boolean
  ) => {
    const trialRecord: RawTrialData = {
      trialIndex: trialIdx + 1,
      stimulus: 'PVT_FLASH',
      isTarget: true,
      userResponded: !isPremature,
      reactionTimeMs: rt,
      isCorrect: !isFalseStart && !isLapse && !isPremature,
      feedbackType: isPremature ? 'FALSE_START' : isLapse ? 'LAPSE' : isFalseStart ? 'FALSE_START' : 'VALID_REACTION',
      timestamp: Date.now(),
    };

    setRawTrials((prev) => [...prev, trialRecord]);
  };

  // Advance to next trial after brief feedback display
  const advanceToNextTrial = (nextIdx: number) => {
    setCurrentTrial(nextIdx);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);

    feedbackTimeoutRef.current = setTimeout(() => {
      scheduleTrialStimulus(nextIdx);
    }, 1300);
  };

  // User input handler (clicks or spacebar)
  const handleUserTrigger = () => {
    if (phase === 'FIXATION') {
      // Premature click before stimulus appeared!
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
      spaceAudio.playWarning();
      isPrematureFlagRef.current = true;
      recordTrial(currentTrial, null, true, false, true);

      setTrialFeedback({
        text: 'FALSE START (PREMATURE)',
        subtext: 'Tapped before stimulus onset! Wait for the green counter.',
        type: 'WARNING',
      });
      setPhase('FEEDBACK');
      advanceToNextTrial(currentTrial + 1);
      return;
    }

    if (phase === 'STIMULUS_ACTIVE') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      const finishTime = performance.now();
      const reactionTimeMs = Math.round(finishTime - stimulusStartTimeRef.current);
      stimulusStartTimeRef.current = 0;

      // Check false start (<100ms is anticipatory physiological artifact)
      const isAnticipation = reactionTimeMs < 100;
      const isLapse = reactionTimeMs >= 500;

      if (isAnticipation) {
        spaceAudio.playWarning();
        recordTrial(currentTrial, reactionTimeMs, true, false, false);
        setTrialFeedback({
          text: `${reactionTimeMs} ms — FALSE START`,
          subtext: 'Anticipatory click (<100ms) is physiologically invalid.',
          type: 'WARNING',
        });
      } else if (isLapse) {
        spaceAudio.playWarning();
        recordTrial(currentTrial, reactionTimeMs, false, true, false);
        setTrialFeedback({
          text: `${reactionTimeMs} ms — ATTENTION LAPSE (>500ms)`,
          subtext: 'Delayed response indicates cognitive vigilance deceleration.',
          type: 'DANGER',
        });
      } else {
        spaceAudio.playExecute();
        recordTrial(currentTrial, reactionTimeMs, false, false, false);
        const qualityText = reactionTimeMs < 230 ? 'Elite Reflex' : reactionTimeMs < 270 ? 'Nominal Reaction' : 'Acceptable Speed';
        setTrialFeedback({
          text: `${reactionTimeMs} ms`,
          subtext: `${qualityText} • Recorded to high-resolution flight clock.`,
          type: 'SUCCESS',
        });
      }

      setElapsedDisplayMs(reactionTimeMs);
      setPhase('FEEDBACK');
      advanceToNextTrial(currentTrial + 1);
    }
  };

  // Keyboard listener (Spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleUserTrigger();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, currentTrial]);

  // Start test
  const startAssessment = () => {
    sessionStartTimeRef.current = Date.now();
    setCurrentTrial(0);
    setRawTrials([]);
    scheduleTrialStimulus(0);
  };

  // Finish assessment and calculate full battery metrics
  const finishAssessment = () => {
    setPhase('COMPLETED');
    const totalDurationSec = Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000));

    // Extract valid reaction times (non-null, >= 100ms)
    setRawTrials((currentRaw) => {
      const validRts = currentRaw
        .filter((t) => t.reactionTimeMs !== null && t.reactionTimeMs >= 100)
        .map((t) => t.reactionTimeMs as number);

      const lapses = currentRaw.filter((t) => t.feedbackType === 'LAPSE').length;
      const falseStarts = currentRaw.filter((t) => t.feedbackType === 'FALSE_START').length;

      const meanRt = calculateMean(validRts) || 300;
      const medianRt = calculateMedian(validRts) || 300;
      const fastest10Rt = calculateFastest10Percent(validRts) || meanRt;

      const baselineRt = 242; // ms
      const baselineComparison = Number((((meanRt - baselineRt) / baselineRt) * 100).toFixed(1));
      const rating = classifyPvtReadiness(meanRt, lapses, falseStarts);

      const metrics: PvtMetrics = {
        meanReactionMs: meanRt,
        medianReactionMs: medianRt,
        fastest10PercentMs: fastest10Rt,
        lapsesCount: lapses,
        falseStartsCount: falseStarts,
        validTrialsCount: validRts.length,
        totalTrials: currentRaw.length,
        baselineComparisonPercent: baselineComparison,
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
          <div className="p-1.5 rounded-lg bg-yellow-950/80 border border-yellow-700/50 text-yellow-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{levelConfig.title}</span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-slate-800 text-yellow-400 border border-yellow-500/30 font-bold">
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
                {Math.min(currentTrial + 1, levelConfig.trialCount)} / {levelConfig.trialCount}
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
            className="bg-gradient-to-r from-yellow-500 to-amber-400 h-full transition-all duration-300"
            style={{ width: `${(Math.min(currentTrial, levelConfig.trialCount) / levelConfig.trialCount) * 100}%` }}
          />
        </div>
      )}

      {/* Main Testing Canvas */}
      {phase === 'INSTRUCTIONS' ? (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-center font-mono space-y-5">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">
              PROTOCOL BRIEFING: {levelConfig.name.toUpperCase()}
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
              className="px-8 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-mono font-black text-sm transition shadow-lg shadow-yellow-500/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>COMMENCE ASSESSMENT</span>
            </button>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Spacebar or Click / Tap is enabled for all responses.
            </div>
          </div>
        </div>
      ) : (
        /* Active Reaction Arena */
        <div
          onClick={handleUserTrigger}
          className={`relative min-h-[360px] rounded-2xl border-2 flex flex-col items-center justify-center p-8 transition cursor-pointer select-none shadow-2xl ${
            phase === 'FIXATION'
              ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
              : phase === 'STIMULUS_ACTIVE'
              ? 'bg-emerald-500 border-emerald-300 text-slate-950 shadow-[0_0_50px_rgba(16,185,129,0.8)]'
              : trialFeedback?.type === 'DANGER'
              ? 'bg-rose-950/60 border-rose-500/80 text-rose-200'
              : trialFeedback?.type === 'WARNING'
              ? 'bg-amber-950/60 border-amber-500/80 text-amber-200'
              : 'bg-cyan-950/60 border-cyan-500/80 text-cyan-200'
          }`}
        >
          {/* Phase 1: Fixation Cross (+) */}
          {phase === 'FIXATION' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="text-5xl font-mono text-yellow-400 font-bold animate-pulse tracking-tighter">
                +
              </div>
              <div className="text-xs font-mono text-slate-400 tracking-wider">
                WAIT FOR GREEN STIMULUS...
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                (Clicking before green registers a False Start)
              </div>
            </div>
          )}

          {/* Phase 2: Active Stimulus (Rolling Millisecond Counter) */}
          {phase === 'STIMULUS_ACTIVE' && (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="text-7xl font-mono font-black tracking-tight text-slate-950 drop-shadow-md">
                {elapsedDisplayMs} <span className="text-2xl">ms</span>
              </div>
              <div className="text-xl font-mono font-black uppercase tracking-widest text-slate-950 animate-bounce">
                TAP NOW!
              </div>
            </div>
          )}

          {/* Phase 3: Trial Feedback Screen */}
          {phase === 'FEEDBACK' && trialFeedback && (
            <div className="text-center font-mono space-y-2 max-w-md">
              <div className="text-3xl font-black tracking-tight">{trialFeedback.text}</div>
              <p className="text-xs font-sans opacity-90">{trialFeedback.subtext}</p>
              <div className="pt-2 text-[10px] opacity-70">Next trial initializing...</div>
            </div>
          )}

          {/* Bottom input prompt */}
          <div className="absolute bottom-4 left-0 right-0 text-center font-mono text-[10px] opacity-60">
            CLICK / TAP ANYWHERE OR PRESS SPACEBAR
          </div>
        </div>
      )}
    </div>
  );
};
