/**
 * ASTRA Health - Neuro-Lab Assessment Results & Flight Readiness Modal
 * Displays comprehensive peer-reviewed metrics, baseline deviations,
 * raw trial audit table, and progressive level unlock status.
 */

import React, { useState } from 'react';
import { 
  CheckCircle2, 
  X, 
  RotateCcw, 
  ArrowRight, 
  Award, 
  FileText, 
  Activity, 
  Brain, 
  Target, 
  Zap, 
  ShieldCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { NeuroLabSession, NeuroTaskType } from '../../../types/neurolab';

interface NeuroLabResultsModalProps {
  session: NeuroLabSession;
  unlockedNextLevel: boolean;
  nextLevelName?: string;
  onClose: () => void;
  onRetry: () => void;
  onProceedNextLevel?: () => void;
  onAskAstra?: (prompt: string) => void;
}

export const NeuroLabResultsModal: React.FC<NeuroLabResultsModalProps> = ({
  session,
  unlockedNextLevel,
  nextLevelName,
  onClose,
  onRetry,
  onProceedNextLevel,
  onAskAstra,
}) => {
  const [showRawTable, setShowRawTable] = useState(false);

  const { taskType, level, levelName, primaryScore, durationSeconds, pvtMetrics, nBackMetrics, cptMetrics, rawTrials } = session;

  const getReadinessBadge = (rating?: string) => {
    switch (rating) {
      case 'OPTIMAL':
        return {
          label: 'OPTIMAL FLIGHT READINESS',
          color: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50',
          dot: 'bg-emerald-400',
        };
      case 'NOMINAL':
        return {
          label: 'NOMINAL OPERATIONAL STATUS',
          color: 'bg-cyan-950/80 text-cyan-400 border-cyan-500/50',
          dot: 'bg-cyan-400',
        };
      case 'FATIGUE_MONITOR':
        return {
          label: 'CIRCADIAN FATIGUE DETECTED',
          color: 'bg-amber-950/80 text-amber-400 border-amber-500/50',
          dot: 'bg-amber-400',
        };
      default:
        return {
          label: 'ATTENTION MONITOR REQUIRED',
          color: 'bg-rose-950/80 text-rose-400 border-rose-500/50',
          dot: 'bg-rose-400',
        };
    }
  };

  const currentRating = pvtMetrics?.readinessRating || nBackMetrics?.readinessRating || cptMetrics?.readinessRating || 'NOMINAL';
  const badgeStyle = getReadinessBadge(currentRating);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-mono">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700/50 text-cyan-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  {taskType} ASSESSMENT REPORT • LEVEL {level} ({levelName.toUpperCase()})
                </h2>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Official protocol summary • Sol {session.sol} • Duration: {durationSeconds}s
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          
          {/* Top Banner: Flight Readiness Status */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block mb-1">Aerospace Medical Classification</span>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${badgeStyle.color}`}>
                <span className={`w-2 h-2 rounded-full ${badgeStyle.dot} animate-pulse`} />
                <span>{badgeStyle.label}</span>
              </div>
            </div>

            <div className="text-right sm:text-right">
              <span className="text-[10px] text-slate-500 uppercase block">Calibrated Score</span>
              <div className="text-2xl font-black text-cyan-400">
                {taskType === 'PVT' ? `${Math.round(primaryScore)} ms` : `${Math.round(primaryScore)}%`}
              </div>
            </div>
          </div>

          {/* Level Unlock Notification */}
          {unlockedNextLevel && (
            <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/50 flex items-center justify-between gap-3 text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <strong className="font-bold text-emerald-300 block">NEW FLIGHT CERTIFICATION UNLOCKED</strong>
                  <span className="text-[11px] font-sans">Level {level + 1} ({nextLevelName || 'Next Rank'}) is now available in your Neuro-Lab.</span>
                </div>
              </div>
              {onProceedNextLevel && (
                <button
                  onClick={onProceedNextLevel}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0 inline-flex items-center gap-1"
                >
                  <span>ADVANCE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* PVT Specific Metrics Grid */}
          {taskType === 'PVT' && pvtMetrics && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Psychomotor Latency & Vigilance Analysis</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Mean Latency</span>
                  <strong className="text-base text-slate-100">{pvtMetrics.meanReactionMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Baseline: 242 ms ({pvtMetrics.baselineComparisonPercent > 0 ? `+${pvtMetrics.baselineComparisonPercent}%` : `${pvtMetrics.baselineComparisonPercent}%`})
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Median Reaction</span>
                  <strong className="text-base text-cyan-400">{pvtMetrics.medianReactionMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Robust central tendency</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Fastest 10% Decile</span>
                  <strong className="text-base text-emerald-400">{pvtMetrics.fastest10PercentMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Peak neuromuscular speed</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Lapses (&gt;500ms)</span>
                  <strong className={`text-base ${pvtMetrics.lapsesCount > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
                    {pvtMetrics.lapsesCount}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Attentional slips</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">False Starts</span>
                  <strong className={`text-base ${pvtMetrics.falseStartsCount > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
                    {pvtMetrics.falseStartsCount}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Premature taps</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Valid Trials</span>
                  <strong className="text-base text-slate-100">
                    {pvtMetrics.validTrialsCount} / {pvtMetrics.totalTrials}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Completed protocol</span>
                </div>
              </div>
            </div>
          )}

          {/* N-Back Specific Metrics Grid */}
          {taskType === 'NBACK' && nBackMetrics && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-cyan-400" />
                <span>Working Memory Capacity & Signal Detection Analysis</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Total Accuracy</span>
                  <strong className="text-base text-cyan-400">{nBackMetrics.accuracyPercent}%</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Hits + Rejections</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Sensitivity (d')</span>
                  <strong className="text-base text-emerald-400">{nBackMetrics.dPrime}</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Hautus log-linear rule</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Mean Latency</span>
                  <strong className="text-base text-slate-100">{nBackMetrics.meanLatencyMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Average decision speed</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Correct Hits</span>
                  <strong className="text-base text-emerald-400">{nBackMetrics.correctHits}</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Target detected</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Missed Targets</span>
                  <strong className="text-base text-amber-400">{nBackMetrics.missedTargets}</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Omission errors</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">False Alarms</span>
                  <strong className="text-base text-rose-400">{nBackMetrics.falseAlarms}</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Commission errors</span>
                </div>
              </div>
            </div>
          )}

          {/* CPT Specific Metrics Grid */}
          {taskType === 'CPT' && cptMetrics && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>Continuous Performance & Vigilance Decrement Analysis</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Total Accuracy</span>
                  <strong className="text-base text-emerald-400">{cptMetrics.accuracyPercent}%</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Overall task fidelity</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Commission Errors</span>
                  <strong className={`text-base ${cptMetrics.commissionErrors > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
                    {cptMetrics.commissionErrors}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Pressed on No-Go</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Omission Errors</span>
                  <strong className={`text-base ${cptMetrics.omissionErrors > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
                    {cptMetrics.omissionErrors}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Missed Go signals</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Mean Hit RT</span>
                  <strong className="text-base text-slate-100">{cptMetrics.meanHitRtMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Standard response speed</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">RT Variability (SD)</span>
                  <strong className="text-base text-cyan-400">±{cptMetrics.rtVariabilityMs} ms</strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Attentional stability</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase block">Vigilance Decrement</span>
                  <strong className={`text-base ${cptMetrics.vigilanceDecrementPercent > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {cptMetrics.firstHalfAccuracy}% → {cptMetrics.secondHalfAccuracy}%
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">1st half vs 2nd half</span>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Raw Trial Audit Data */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <button
              onClick={() => setShowRawTable(!showRawTable)}
              className="w-full px-4 py-3 flex items-center justify-between text-slate-300 hover:text-white transition cursor-pointer text-xs font-bold"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>INSPECT RAW TRIAL-LEVEL TELEMETRY ({rawTrials.length} Trials)</span>
              </div>
              {showRawTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showRawTable && (
              <div className="p-3 border-t border-slate-800 max-h-56 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 uppercase text-[9px]">
                      <th className="pb-1.5">#</th>
                      <th className="pb-1.5">Stimulus</th>
                      <th className="pb-1.5">Target</th>
                      <th className="pb-1.5">Response</th>
                      <th className="pb-1.5">Latency</th>
                      <th className="pb-1.5 text-right">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {rawTrials.map((t) => (
                      <tr key={t.trialIndex} className="hover:bg-slate-900/60">
                        <td className="py-1 text-slate-500">{t.trialIndex}</td>
                        <td className="py-1 text-slate-300">{t.stimulus}</td>
                        <td className="py-1">{t.isTarget ? <span className="text-cyan-400 font-bold">YES</span> : <span className="text-slate-600">NO</span>}</td>
                        <td className="py-1">{t.userResponded ? <span className="text-emerald-400 font-bold">YES</span> : <span className="text-slate-600">NO</span>}</td>
                        <td className="py-1">{t.reactionTimeMs ? `${t.reactionTimeMs} ms` : '—'}</td>
                        <td className="py-1 text-right">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            t.isCorrect ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}>
                            {t.feedbackType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Action Footer */}
        <div className="px-5 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>REPLAY LEVEL</span>
          </button>

          <div className="flex items-center gap-2">
            {onAskAstra && (
              <button
                onClick={() => onAskAstra(`Analyze my latest ${taskType} Level ${level} cognitive test results and give flight surgeon advice.`)}
                className="px-3 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/50 text-purple-300 text-xs font-bold transition cursor-pointer"
              >
                ASK ASTRA AI
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition cursor-pointer shadow-md"
            >
              SAVE & RETURN
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
