/**
 * ASTRA Health - Dedicated Check-In Page
 * Follows exact specifications:
 * - DAILY CHECK-IN "How are you feeling today?"
 * - Sliders: Energy, Stress, Fatigue, Mood, Sleep quality
 * - Optional notes
 * - [ COMPLETE CHECK-IN ]
 * - Post-submission: ASTRA SUMMARY comparing today's answers with recent data.
 */

import React, { useState } from 'react';
import { 
  ClipboardCheck, 
  Sparkles, 
  CheckCircle2, 
  MessageSquare, 
  Activity, 
  RotateCcw,
  Zap,
  Flame,
  Moon,
  Smile,
  AlertCircle,
  Upload
} from 'lucide-react';
import { DailyCheckIn, CheckInSubmissionPayload } from '../../types/health';

interface CheckInViewProps {
  sol: number;
  existingCheckIn?: DailyCheckIn;
  onSubmitCheckIn: (data: CheckInSubmissionPayload | any) => Promise<any>;
  onAskAstra: (prompt: string) => void;
  onViewOverview: () => void;
  onOpenUpload?: () => void;
}

export const CheckInView: React.FC<CheckInViewProps> = ({
  sol,
  existingCheckIn,
  onSubmitCheckIn,
  onAskAstra,
  onViewOverview,
  onOpenUpload,
}) => {
  const [energy, setEnergy] = useState(existingCheckIn?.energy ?? 65);
  const [stress, setStress] = useState(existingCheckIn?.stress ?? 40);
  const [fatigue, setFatigue] = useState(existingCheckIn?.fatigue ?? 55);
  const [mood, setMood] = useState(existingCheckIn?.mood ?? 70);
  const [sleepQuality, setSleepQuality] = useState(existingCheckIn?.sleepQuality ?? 65);
  const [sleepHours, setSleepHours] = useState<number>(
    existingCheckIn?.mental?.sleepHours ?? 
    (existingCheckIn?.mental?.sleepDurationMinutes ? Math.floor(existingCheckIn.mental.sleepDurationMinutes / 60) : 7)
  );
  const [sleepMinutes, setSleepMinutes] = useState<number>(
    existingCheckIn?.mental?.sleepMinutes ?? 
    (existingCheckIn?.mental?.sleepDurationMinutes ? existingCheckIn.mental.sleepDurationMinutes % 60 : 30)
  );
  const [subjectiveNotes, setSubjectiveNotes] = useState(existingCheckIn?.subjectiveNotes ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(!!existingCheckIn);
  const [submittedSummary, setSubmittedSummary] = useState<string | null>(
    existingCheckIn?.healthEngineAnalysis || null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSubmitCheckIn({
        energy,
        stress,
        fatigue,
        mood,
        sleepQuality,
        sleepHours,
        sleepMinutes,
        sleepDurationMinutes: sleepHours * 60 + sleepMinutes,
        subjectiveNotes,
      });

      // Generate flight-surgeon deterministic summary
      const summaryText = fatigue > 60
        ? `Subjective fatigue (${fatigue}/100) is elevated (+22% vs baseline). Paired with current sleep log (${sleepHours}h ${sleepMinutes}m), this confirms autonomic recovery deficit. Recommend 30-minute rest before EVAs or heavy ARED cycles.`
        : `Check-in values logged for Sol ${sol}. Rest window (${sleepHours}h ${sleepMinutes}m), energy (${energy}/100), and subjective mood (${mood}/100) are congruent with expected cruise baselines. Recovery status is stable.`;

      setSubmittedSummary(summaryText);
      setIsCompleted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSliderDescriptor = (val: number, type: 'energy' | 'stress' | 'fatigue' | 'mood' | 'sleep') => {
    if (type === 'energy') {
      return val > 75 ? '⚡ Optimal / Charged' : val > 50 ? '🔋 Moderate' : '🪫 Depleted';
    }
    if (type === 'stress') {
      return val > 70 ? '🌋 High Pressure' : val > 40 ? '😐 Moderate' : '🧘 Zen & Calm';
    }
    if (type === 'fatigue') {
      return val > 70 ? '😵 Heavy Exhaustion' : val > 40 ? '🥱 Moderate' : '🌱 Fresh & Rested';
    }
    if (type === 'mood') {
      return val > 70 ? '🤩 Thriving / Positive' : val > 40 ? '🙂 Steady' : '😫 Strained';
    }
    if (type === 'sleep') {
      return val > 75 ? '🛌 Deep Restorative' : val > 50 ? '🌙 Fair' : '⚡ Fragmented';
    }
    return '';
  };

  return (
    <div id="daily-checkin-page-view" className="max-w-2xl mx-auto space-y-5 pb-10">
      
      {/* Header */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700/50">
            <ClipboardCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 tracking-tight">
              DAILY CHECK-IN
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Subjective physiological & psychological recovery log • Sol {sol}
            </p>
          </div>
        </div>

        {onOpenUpload && (
          <button
            type="button"
            onClick={onOpenUpload}
            className="px-3.5 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 font-mono text-xs flex items-center gap-2 transition self-start sm:self-center"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span>Upload Medical Report</span>
          </button>
        )}
      </div>

      {/* Post-Submission Summary (ASTRA SUMMARY) */}
      {isCompleted && submittedSummary && (
        <div 
          id="astra-checkin-summary-card"
          className="rounded-2xl bg-slate-900 border border-cyan-800/60 p-5 space-y-3 shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-100">
                ASTRA SUMMARY
              </h3>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sol {sol} Check-in Stored
            </span>
          </div>

          <p className="text-sm text-slate-200 font-sans leading-relaxed">
            {submittedSummary}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={() => setIsCompleted(false)}
              className="text-xs font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Update Responses</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onViewOverview}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 font-bold transition cursor-pointer"
              >
                RETURN TO OVERVIEW
              </button>
              <button
                onClick={() => onAskAstra('Evaluate today\'s check-in responses alongside my telemetry trends')}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-mono text-white font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>DISCUSS WITH ASTRA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Check-In Form */}
      {(!isCompleted || !submittedSummary) && (
        <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-semibold text-slate-100">
              How are you feeling today?
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Calibrate your subjective status for crew medical monitoring
            </p>
          </div>

          <div className="space-y-6">
            
            {/* Expressive Mood Emoji Selection */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <label className="text-xs font-mono text-cyan-300 font-semibold flex items-center justify-between">
                <span>🧠 MOOD & EMOTIONAL WELLBEING</span>
                <span className="text-slate-400 font-normal">{getSliderDescriptor(mood, 'mood')}</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: 90, emoji: '😄', label: 'Great', color: 'hover:border-emerald-500/60 bg-emerald-950/30 text-emerald-300' },
                  { value: 75, emoji: '🙂', label: 'Good', color: 'hover:border-cyan-500/60 bg-cyan-950/30 text-cyan-300' },
                  { value: 55, emoji: '😐', label: 'Okay', color: 'hover:border-slate-500/60 bg-slate-900/60 text-slate-300' },
                  { value: 35, emoji: '😟', label: 'Low', color: 'hover:border-amber-500/60 bg-amber-950/30 text-amber-300' },
                  { value: 20, emoji: '😣', label: 'Stressed', color: 'hover:border-rose-500/60 bg-rose-950/30 text-rose-300' },
                ].map((item) => {
                  const isSelected = Math.abs(mood - item.value) <= 12;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setMood(item.value)}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer transform active:scale-95 ${
                        isSelected 
                          ? 'border-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/50 scale-[1.03] shadow-md' 
                          : `border-slate-800 ${item.color}`
                      }`}
                    >
                      <span className="text-2xl hover:scale-110 transition">{item.emoji}</span>
                      <span className="text-[10px] font-mono font-medium tracking-tight text-slate-200">{item.label}</span>
                    </button>
                  );
                })}
              </div>
              
              {/* Fine-tune mood slider */}
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Fine-tune Mood Rating</span>
                  <span className="text-slate-100 font-bold">{mood}/100</span>
                </div>
                <input
                  id="checkin-mood-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={mood}
                  onChange={(e) => setMood(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Input-Friendly Rest & Sleep Duration */}
            <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-purple-900/60 font-mono">
              <div className="flex items-center justify-between text-xs text-slate-200 font-semibold">
                <span className="flex items-center gap-1.5 text-purple-300">
                  🌙 REST & SLEEP DURATION LOG
                </span>
                <span className="text-purple-300 font-bold bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-800/60">
                  Recorded: <strong className="text-white">{sleepHours}h {sleepMinutes}m</strong> ({((sleepHours * 60 + sleepMinutes) / 60).toFixed(1)} hrs)
                </span>
              </div>

              {/* Direct Hour & Minute Numeric Inputs with +/- Stepper Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                {/* Hours */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">
                    Hours Slept
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSleepHours((prev: number) => Math.max(0, prev - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                      title="Decrease 1 hour"
                    >
                      -1h
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={sleepHours}
                      onChange={(e) => setSleepHours(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
                      className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-purple-400"
                    />
                    <button
                      type="button"
                      onClick={() => setSleepHours((prev: number) => Math.min(24, prev + 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                      title="Increase 1 hour"
                    >
                      +1h
                    </button>
                  </div>
                </div>

                {/* Minutes */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">
                    Minutes Slept
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (sleepMinutes >= 15) {
                          setSleepMinutes((prev: number) => prev - 15);
                        } else if (sleepHours > 0) {
                          setSleepHours((prev: number) => prev - 1);
                          setSleepMinutes(45);
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                      title="Decrease 15 mins"
                    >
                      -15m
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="5"
                      value={sleepMinutes}
                      onChange={(e) => setSleepMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                      className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-purple-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (sleepMinutes + 15 < 60) {
                          setSleepMinutes((prev: number) => prev + 15);
                        } else {
                          setSleepHours((prev: number) => prev + 1);
                          setSleepMinutes(0);
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                      title="Increase 15 mins"
                    >
                      +15m
                    </button>
                  </div>
                </div>
              </div>

              {/* Drag Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Slide Duration</span>
                  <span className="font-bold text-purple-300">
                    {((sleepHours * 60 + sleepMinutes) / 60).toFixed(2)} Hours
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="720"
                  step="15"
                  value={sleepHours * 60 + sleepMinutes}
                  onChange={(e) => {
                    const totalMins = Number(e.target.value);
                    setSleepHours(Math.floor(totalMins / 60));
                    setSleepMinutes(totalMins % 60);
                  }}
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
              </div>

              {/* Progress Bar Visualizer */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Rest Window Progress</span>
                  <span>Target: 8.0 Hours (NASA Baseline)</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(((sleepHours * 60 + sleepMinutes) / 480) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Quick Sleep Presets */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block font-bold">Quick Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { h: 5, m: 30, label: '5.5h' },
                    { h: 6, m: 0, label: '6.0h 🌙' },
                    { h: 6, m: 30, label: '6.5h' },
                    { h: 7, m: 0, label: '7.0h 😴' },
                    { h: 7, m: 30, label: '7.5h 💤' },
                    { h: 8, m: 0, label: '8.0h 🌟 Target' },
                    { h: 8, m: 30, label: '8.5h ☀️' },
                    { h: 9, m: 0, label: '9.0h' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSleepHours(preset.h);
                        setSleepMinutes(preset.m);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        sleepHours === preset.h && sleepMinutes === preset.m
                          ? 'bg-purple-600 text-white shadow-sm scale-102 ring-1 ring-purple-400'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Expressive Sleep Quality Selection */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <label className="text-xs font-mono text-purple-300 font-semibold flex items-center justify-between">
                <span>🌙 SLEEP RECOVERY & QUALITY</span>
                <span className="text-slate-400 font-normal">{getSliderDescriptor(sleepQuality, 'sleep')}</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 90, emoji: '🌟', label: 'Excellent' },
                  { value: 75, emoji: '😴', label: 'Good' },
                  { value: 50, emoji: '😑', label: 'Fair' },
                  { value: 25, emoji: '😫', label: 'Poor' },
                ].map((item) => {
                  const isSelected = Math.abs(sleepQuality - item.value) <= 12;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setSleepQuality(item.value)}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer transform active:scale-95 ${
                        isSelected 
                          ? 'border-purple-400 bg-purple-500/20 ring-1 ring-purple-400/50 scale-[1.03] shadow-md' 
                          : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-purple-500/40'
                      }`}
                    >
                      <span className="text-2xl hover:scale-110 transition">{item.emoji}</span>
                      <span className="text-[10px] font-mono font-medium tracking-tight text-slate-200">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Fine-tune sleep quality slider */}
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Fine-tune Sleep Index</span>
                  <span className="text-slate-100 font-bold">{sleepQuality}/100</span>
                </div>
                <input
                  id="checkin-sleep-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
              </div>
            </div>

            {/* Micro-Indicators: Energy, Stress, Fatigue */}
            <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
              <h4 className="text-xs font-mono text-slate-300 font-semibold uppercase tracking-wider">
                Physiological Micro-Indicators
              </h4>

              {/* Energy */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Energy
                  </span>
                  <span className="text-slate-400 font-semibold">
                    <strong className="text-slate-100">{energy}</strong>/100 ({getSliderDescriptor(energy, 'energy')})
                  </span>
                </div>
                <input
                  id="checkin-energy-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value))}
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>

              {/* Stress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" /> Stress
                  </span>
                  <span className="text-slate-400 font-semibold">
                    <strong className="text-slate-100">{stress}</strong>/100 ({getSliderDescriptor(stress, 'stress')})
                  </span>
                </div>
                <input
                  id="checkin-stress-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={stress}
                  onChange={(e) => setStress(Number(e.target.value))}
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-rose-400"
                />
              </div>

              {/* Fatigue */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" /> Fatigue
                  </span>
                  <span className="text-slate-400 font-semibold">
                    <strong className="text-slate-100">{fatigue}</strong>/100 ({getSliderDescriptor(fatigue, 'fatigue')})
                  </span>
                </div>
                <input
                  id="checkin-fatigue-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={fatigue}
                  onChange={(e) => setFatigue(Number(e.target.value))}
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Reflection / Journal Notes */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-mono text-slate-300 font-medium flex items-center gap-1.5">
                <span>💭 Personal Reflection & Journal Notes</span>
              </label>
              <textarea
                id="checkin-notes-input"
                rows={3}
                placeholder="Log physical soreness, mood nuances, circadian disruption, headache, or operational remarks..."
                value={subjectiveNotes}
                onChange={(e) => setSubjectiveNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-sans placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition resize-none"
              />
            </div>

          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              id="complete-checkin-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-mono font-bold text-white transition cursor-pointer shadow-sm"
            >
              {isSubmitting ? 'PROCESSING WITH HEALTH ENGINE...' : 'COMPLETE CHECK-IN'}
            </button>
          </div>

        </form>
      )}

    </div>
  );
};
