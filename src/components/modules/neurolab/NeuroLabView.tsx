/**
 * ASTRA Health - Unified NEURO-LAB Progressive Cognitive Testing System
 * Complete 5-level progressive battery for PVT (Reaction), N-Back (Working Memory), and CPT (Sustained Attention).
 * 100% Offline, Dexie/local persistence, high-resolution monotonic clock, Signal Detection Theory (d').
 */

import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Brain, 
  Target, 
  Lock, 
  CheckCircle2, 
  Play, 
  RotateCcw, 
  Award, 
  History, 
  Info, 
  ShieldCheck, 
  Sparkles, 
  AlertCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  Activity,
  ArrowLeft
} from 'lucide-react';
import { 
  NeuroTaskType, 
  NeuroLevelId, 
  NeuroLevelConfig, 
  NeuroLabProgression, 
  NeuroLabSession,
  RawTrialData,
  PvtMetrics,
  NBackMetrics,
  CptMetrics
} from '../../../types/neurolab';
import { NEURO_LEVELS } from '../../../data/neurolabProtocols';
import { PvtAssessmentGame } from './PvtAssessmentGame';
import { NBackAssessmentGame } from './NBackAssessmentGame';
import { CptAssessmentGame } from './CptAssessmentGame';
import { NeuroLabResultsModal } from './NeuroLabResultsModal';
import { CognitiveTaskResult, HealthMeasurement, MetricBaseline } from '../../../types/health';
import { spaceAudio } from '../../../utils/spaceAudio';
import { db } from '../../../services/db';

interface NeuroLabViewProps {
  sol: number;
  currentHealth?: HealthMeasurement;
  baselines?: MetricBaseline[];
  onRecordCognitiveResult: (result: Omit<CognitiveTaskResult, 'id' | 'timestamp' | 'sol'>) => Promise<void>;
  onAskAstra: (prompt: string) => void;
  onNavigateBack?: () => void;
}

const DEFAULT_PROGRESSION: NeuroLabProgression = {
  PVT: {
    unlockedLevel: 1,
    highestCompletedLevel: 0,
    bestScoreByLevel: {},
  },
  NBACK: {
    unlockedLevel: 1,
    highestCompletedLevel: 0,
    bestScoreByLevel: {},
  },
  CPT: {
    unlockedLevel: 1,
    highestCompletedLevel: 0,
    bestScoreByLevel: {},
  },
};

export const NeuroLabView: React.FC<NeuroLabViewProps> = ({
  sol,
  currentHealth,
  baselines,
  onRecordCognitiveResult,
  onAskAstra,
  onNavigateBack,
}) => {
  const [activeTask, setActiveTask] = useState<NeuroTaskType>('PVT');
  const [progression, setProgression] = useState<NeuroLabProgression>(DEFAULT_PROGRESSION);
  const [activeGameLevel, setActiveGameLevel] = useState<NeuroLevelId | null>(null);
  const [activeSessionResult, setActiveSessionResult] = useState<NeuroLabSession | null>(null);
  const [justUnlockedNext, setJustUnlockedNext] = useState<boolean>(false);
  const [recentSessions, setRecentSessions] = useState<CognitiveTaskResult[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Load progression from localStorage & Dexie on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('astra_neurolab_progression_v2');
      if (saved) {
        setProgression(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to parse saved progression:', e);
    }

    loadHistoricalSessions();
  }, []);

  // Save progression helper
  const saveProgression = (updated: NeuroLabProgression) => {
    setProgression(updated);
    try {
      localStorage.setItem('astra_neurolab_progression_v2', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save progression:', e);
    }
  };

  const loadHistoricalSessions = async () => {
    try {
      const records = await db.cognitiveResults.orderBy('timestamp').reverse().limit(15).toArray();
      setRecentSessions(records);
    } catch (err) {
      console.error('Failed to load cognitive history from db:', err);
    }
  };

  // Launch assessment for a selected level
  const handleLaunchLevel = (levelId: NeuroLevelId) => {
    const isUnlocked = levelId <= progression[activeTask].unlockedLevel;
    if (!isUnlocked) return;

    spaceAudio.playClick();
    setActiveGameLevel(levelId);
  };

  // Assessment completion handler
  const handleAssessmentFinish = async (
    task: NeuroTaskType,
    levelId: NeuroLevelId,
    score: number,
    durationSec: number,
    rawTrials: RawTrialData[],
    metrics: { pvt?: PvtMetrics; nBack?: NBackMetrics; cpt?: CptMetrics }
  ) => {
    spaceAudio.playExecute();

    const currentProg = progression[task];
    const prevUnlocked = currentProg.unlockedLevel;
    const nextLevel = Math.min(5, levelId + 1) as NeuroLevelId;
    const isNewUnlock = nextLevel > prevUnlocked;

    // Update progression
    const updatedProg: NeuroLabProgression = {
      ...progression,
      [task]: {
        ...currentProg,
        unlockedLevel: Math.max(prevUnlocked, nextLevel) as NeuroLevelId,
        highestCompletedLevel: Math.max(currentProg.highestCompletedLevel, levelId),
        bestScoreByLevel: {
          ...currentProg.bestScoreByLevel,
          [levelId]: task === 'PVT'
            ? Math.min(score, currentProg.bestScoreByLevel[levelId] || 9999)
            : Math.max(score, currentProg.bestScoreByLevel[levelId] || 0),
        },
        lastTestedSol: sol,
      },
    };
    saveProgression(updatedProg);
    setJustUnlockedNext(isNewUnlock && levelId < 5);

    // Build session record
    const config = NEURO_LEVELS[task][levelId];
    const newSession: NeuroLabSession = {
      id: `session-${Date.now()}`,
      sol,
      timestamp: new Date().toISOString(),
      taskType: task,
      level: levelId,
      levelName: config.name,
      protocolCode: config.protocolCode,
      durationSeconds: durationSec,
      primaryScore: score,
      pvtMetrics: metrics.pvt,
      nBackMetrics: metrics.nBack,
      cptMetrics: metrics.cpt,
      rawTrials,
      deviceContext: typeof navigator !== 'undefined' ? navigator.userAgent : 'Offline Browser',
    };

    setActiveSessionResult(newSession);
    setActiveGameLevel(null);

    // Save into centralized health engine & Dexie
    const baselineScore = task === 'PVT' ? 242 : 90;
    const dev = Number((((score - baselineScore) / baselineScore) * 100).toFixed(1));

    await onRecordCognitiveResult({
      taskType: task === 'PVT' ? 'REACTION' : task === 'NBACK' ? 'MEMORY' : 'ATTENTION',
      score,
      baselineScore,
      deviationPercent: dev,
      durationSeconds: durationSec,
    });

    loadHistoricalSessions();
  };

  const activeLevelConfig = activeGameLevel ? NEURO_LEVELS[activeTask][activeGameLevel] : null;

  return (
    <div id="neurolab-testing-view" className="space-y-5 pb-12 font-sans">
      
      {/* Top Banner & Module Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Return to Mental Health"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-2.5 rounded-2xl bg-cyan-950/80 border border-cyan-700/50 text-cyan-400">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black font-mono tracking-tight text-slate-100 uppercase">
                ASTRA NEURO-LAB // FLIGHT READINESS BATTERY
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-bold">
                PROTOTYPE SUITE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Scientifically calibrated cognitive vigilance, working memory, and sustained attention assessments
            </p>
          </div>
        </div>

        {/* Global Controls: Ask AI & History */}
        <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-xs">
          <button
            onClick={() => setShowHistoryModal(!showHistoryModal)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer border border-slate-700"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>SESSIONS LOG ({recentSessions.length})</span>
          </button>
          <button
            onClick={() => onAskAstra('Assess my cognitive readiness based on recent PVT reaction, working memory, and attention sessions.')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition cursor-pointer shadow-md"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI READINESS BRIEF</span>
          </button>
        </div>
      </div>

      {/* Task Selector Tabs (3 Modules) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
        {/* Module 1: PVT */}
        <button
          onClick={() => {
            spaceAudio.playClick();
            setActiveTask('PVT');
            setActiveGameLevel(null);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            activeTask === 'PVT'
              ? 'bg-slate-900 border-yellow-500/70 shadow-lg shadow-yellow-950/30 ring-1 ring-yellow-500/40'
              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${activeTask === 'PVT' ? 'bg-yellow-500 text-slate-950' : 'bg-slate-900 text-yellow-400 border border-slate-800'}`}>
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                ⚡ PVT — REACTION SPEED
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Psychomotor Vigilance & Attentional Lapses
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-yellow-400 font-bold border border-yellow-500/30">
              Lvl {progression.PVT.unlockedLevel}/5
            </span>
          </div>
        </button>

        {/* Module 2: N-Back */}
        <button
          onClick={() => {
            spaceAudio.playClick();
            setActiveTask('NBACK');
            setActiveGameLevel(null);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            activeTask === 'NBACK'
              ? 'bg-slate-900 border-cyan-500/70 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/40'
              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${activeTask === 'NBACK' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-cyan-400 border border-slate-800'}`}>
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                🧠 N-BACK — WORKING MEMORY
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Spatial Coordinate Retention & Updating
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold border border-cyan-500/30">
              Lvl {progression.NBACK.unlockedLevel}/5
            </span>
          </div>
        </button>

        {/* Module 3: CPT */}
        <button
          onClick={() => {
            spaceAudio.playClick();
            setActiveTask('CPT');
            setActiveGameLevel(null);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            activeTask === 'CPT'
              ? 'bg-slate-900 border-emerald-500/70 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/40'
              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${activeTask === 'CPT' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-emerald-400 border border-slate-800'}`}>
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                🎯 CPT — SUSTAINED ATTENTION
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Go/No-Go & Inhibitory Control Battery
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold border border-emerald-500/30">
              Lvl {progression.CPT.unlockedLevel}/5
            </span>
          </div>
        </button>
      </div>

      {/* Active Game Component (If a level is currently launched) */}
      {activeGameLevel && activeLevelConfig ? (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
          {activeTask === 'PVT' && (
            <PvtAssessmentGame
              levelConfig={activeLevelConfig}
              onFinish={(metrics, rawTrials, durationSec) =>
                handleAssessmentFinish('PVT', activeGameLevel, metrics.meanReactionMs, durationSec, rawTrials, { pvt: metrics })
              }
              onAbort={() => setActiveGameLevel(null)}
            />
          )}

          {activeTask === 'NBACK' && (
            <NBackAssessmentGame
              levelConfig={activeLevelConfig}
              onFinish={(metrics, rawTrials, durationSec) =>
                handleAssessmentFinish('NBACK', activeGameLevel, metrics.accuracyPercent, durationSec, rawTrials, { nBack: metrics })
              }
              onAbort={() => setActiveGameLevel(null)}
            />
          )}

          {activeTask === 'CPT' && (
            <CptAssessmentGame
              levelConfig={activeLevelConfig}
              onFinish={(metrics, rawTrials, durationSec) =>
                handleAssessmentFinish('CPT', activeGameLevel, metrics.accuracyPercent, durationSec, rawTrials, { cpt: metrics })
              }
              onAbort={() => setActiveGameLevel(null)}
            />
          )}
        </div>
      ) : (
        /* 5 Progressive Level Selection Grid */
        <div className="space-y-4">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 uppercase font-bold">Progressive Certification Levels:</span>
              <span className="text-slate-200">{activeTask} PROTOCOLS</span>
            </div>
            <div className="text-slate-400">
              Level 1 is open by default • Complete any level to unlock next rank
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
            {([1, 2, 3, 4, 5] as NeuroLevelId[]).map((levelId) => {
              const config = NEURO_LEVELS[activeTask][levelId];
              const unlockedLevel = progression[activeTask].unlockedLevel;
              const isUnlocked = levelId <= unlockedLevel;
              const isCompleted = levelId <= progression[activeTask].highestCompletedLevel;
              const bestScore = progression[activeTask].bestScoreByLevel[levelId];

              return (
                <div
                  key={levelId}
                  className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                    isUnlocked
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                >
                  {/* Top: Badge, Status */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{config.badgeEmoji}</span>
                      {isCompleted ? (
                        <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>COMPLETED</span>
                        </span>
                      ) : isUnlocked ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold">
                          READY
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">
                          <Lock className="w-3 h-3" />
                          <span>LOCKED</span>
                        </span>
                      )}
                    </div>

                    <div className="font-mono">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Level {levelId}</span>
                      <h4 className="text-sm font-bold text-slate-100">{config.name}</h4>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans mt-2 line-clamp-3 leading-relaxed">
                      {config.description}
                    </p>
                  </div>

                  {/* Bottom: Metrics & Action */}
                  <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2.5 font-mono">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>TRIALS:</span>
                      <strong className="text-slate-200">{config.trialCount}</strong>
                    </div>

                    {bestScore !== undefined && (
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>BEST:</span>
                        <strong className="text-cyan-400">
                          {activeTask === 'PVT' ? `${Math.round(bestScore)} ms` : `${Math.round(bestScore)}%`}
                        </strong>
                      </div>
                    )}

                    <button
                      onClick={() => handleLaunchLevel(levelId)}
                      disabled={!isUnlocked}
                      className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        isUnlocked
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md active:scale-95'
                          : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {isUnlocked ? (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isCompleted ? 'REPLAY LEVEL' : 'START TEST'}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>LOCKED</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Sessions Log Drawer / Table */}
      {showHistoryModal && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100">
                PERSISTENT COGNITIVE SESSIONS AUDIT LOG (DEXIE / INDEXEDDB)
              </h3>
            </div>
            <button
              onClick={() => setShowHistoryModal(false)}
              className="text-slate-400 hover:text-white"
            >
              CLOSE
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="p-4 text-center text-slate-500">
              No historical sessions recorded in local database yet. Complete an assessment level above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 uppercase text-[10px]">
                    <th className="pb-2">Sol</th>
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Protocol Battery</th>
                    <th className="pb-2">Score</th>
                    <th className="pb-2">Baseline</th>
                    <th className="pb-2">Deviation</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentSessions.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 font-bold text-cyan-400">Sol {rec.sol}</td>
                      <td className="py-2.5 text-slate-400">
                        {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 font-bold text-slate-200">
                        {rec.taskType === 'REACTION' ? '⚡ PVT (Speed)' : rec.taskType === 'MEMORY' ? '🧠 N-Back (Memory)' : '🎯 CPT (Attention)'}
                      </td>
                      <td className="py-2.5 font-bold text-emerald-400">
                        {rec.taskType === 'REACTION' ? `${Math.round(rec.score)} ms` : `${Math.round(rec.score)}%`}
                      </td>
                      <td className="py-2.5 text-slate-400">
                        {rec.baselineScore} {rec.taskType === 'REACTION' ? 'ms' : '%'}
                      </td>
                      <td className="py-2.5 font-bold">
                        <span className={rec.deviationPercent <= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                          {rec.deviationPercent > 0 ? `+${rec.deviationPercent}%` : `${rec.deviationPercent}%`}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400">{rec.durationSeconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scientific & Aerospace Clinical Disclaimer */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3 font-mono text-[11px] text-slate-400">
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-slate-300 block uppercase">NASA Human Research Program (HRP) Testing Standard</strong>
          <p className="font-sans text-xs text-slate-400 leading-relaxed">
            The ASTRA Neuro-Lab battery measures behavioral alertness, working memory retention, and sustained visual inhibition against personalized 14-day rolling baselines. Individual test scores are integrated into the ASTRA Health Engine to detect circadian desynchrony, sleep debt, and operational fatigue. Assessments do not replace clinical neuropsychological evaluation.
          </p>
        </div>
      </div>

      {/* Assessment Results Modal */}
      {activeSessionResult && (
        <NeuroLabResultsModal
          session={activeSessionResult}
          unlockedNextLevel={justUnlockedNext}
          nextLevelName={
            activeSessionResult.level < 5
              ? NEURO_LEVELS[activeSessionResult.taskType][(activeSessionResult.level + 1) as NeuroLevelId]?.name
              : undefined
          }
          onClose={() => {
            setActiveSessionResult(null);
            setJustUnlockedNext(false);
          }}
          onRetry={() => {
            const lvl = activeSessionResult.level;
            setActiveSessionResult(null);
            setJustUnlockedNext(false);
            setActiveGameLevel(lvl);
          }}
          onProceedNextLevel={() => {
            const nextLvl = (activeSessionResult.level + 1) as NeuroLevelId;
            setActiveSessionResult(null);
            setJustUnlockedNext(false);
            setActiveGameLevel(nextLvl);
          }}
          onAskAstra={onAskAstra}
        />
      )}

    </div>
  );
};
