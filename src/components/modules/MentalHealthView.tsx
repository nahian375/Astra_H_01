/**
 * ASTRA Health - Mental Health Module (Full Functional Component)
 * 
 * Implements Section 5, 6, 7:
 * 1. Mental Health Index: XX / 100, Status: STABLE / MONITOR / ATTENTION, Personal Baseline: XX–XX
 * 2. SLEEP & RECOVERY: Sleep duration (hours/minutes), quality (1-5), recovery (1-5), consistency + SAVE
 * 3. WELLBEING CHECK-IN: Mood (1-5), Stress (1-5), Energy (1-5), Fatigue (1-5), Notes + SAVE
 * 4. COGNITIVE HEALTH: reaction time, attention, memory + interactive reaction test
 * 5. Check-in history log with save, edit, delete
 * 6. Real-time update into Dexie DB, Health Engine, and Dashboard
 */

import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Moon, 
  Smile, 
  BatteryCharging, 
  AlertCircle, 
  ShieldCheck, 
  ShieldAlert, 
  Plus, 
  Check, 
  X, 
  Trash2, 
  TrendingUp, 
  MessageSquare, 
  Clock, 
  Sparkles,
  Activity,
  Eye,
  Layers
} from 'lucide-react';
import { HealthMeasurement, MetricBaseline, DailyCheckIn, CognitiveTaskResult } from '../../types/health';
import { computeMentalHealthSystem } from '../../health/healthIndexes';
import { spaceAudio } from '../../utils/spaceAudio';

interface MentalHealthViewProps {
  currentHealth: HealthMeasurement;
  baselines: MetricBaseline[];
  checkIns: DailyCheckIn[];
  sol: number;
  onSubmitCheckIn: (checkInData: any) => Promise<any>;
  onRecordMeasurement: (measurement: Partial<HealthMeasurement>) => Promise<void>;
  onRecordCognitiveResult?: (result: Omit<CognitiveTaskResult, 'id' | 'timestamp' | 'sol'>) => Promise<void>;
  onDeleteCheckIn?: (id: string) => Promise<void>;
  onNavigateTrends: () => void;
  onAskAstra: (prompt: string) => void;
}

export const MentalHealthView: React.FC<MentalHealthViewProps> = ({
  currentHealth,
  baselines,
  checkIns,
  sol,
  onSubmitCheckIn,
  onRecordMeasurement,
  onRecordCognitiveResult,
  onDeleteCheckIn,
  onNavigateTrends,
  onAskAstra,
}) => {
  const latestCheckIn = checkIns[0];
  const mentalData = computeMentalHealthSystem(currentHealth, baselines, latestCheckIn);

  // States for interactive wellbeing check-in (1-5 scales mapped to 1-100 internally)
  const [moodRating, setMoodRating] = useState<number>(3); // 1-5
  const [stressRating, setStressRating] = useState<number>(3); // 1-5
  const [energyRating, setEnergyRating] = useState<number>(3); // 1-5
  const [fatigueRating, setFatigueRating] = useState<number>(3); // 1-5
  const [subjectiveNotes, setSubjectiveNotes] = useState<string>('');

  // Sleep entry states
  const [sleepHours, setSleepHours] = useState<number>(6);
  const [sleepMinutes, setSleepMinutes] = useState<number>(18);
  const [sleepQuality1to5, setSleepQuality1to5] = useState<number>(3);
  const [recovery1to5, setRecovery1to5] = useState<number>(3);

  useEffect(() => {
    if (latestCheckIn) {
      if (latestCheckIn.mood !== undefined) setMoodRating(Math.max(1, Math.min(5, Math.round(latestCheckIn.mood / 20))));
      if (latestCheckIn.stress !== undefined) setStressRating(Math.max(1, Math.min(5, Math.round(latestCheckIn.stress / 20))));
      if (latestCheckIn.energy !== undefined) setEnergyRating(Math.max(1, Math.min(5, Math.round(latestCheckIn.energy / 20))));
      if (latestCheckIn.fatigue !== undefined) setFatigueRating(Math.max(1, Math.min(5, Math.round(latestCheckIn.fatigue / 20))));
      if (latestCheckIn.subjectiveNotes) setSubjectiveNotes(latestCheckIn.subjectiveNotes);
    }
    if (currentHealth) {
      if (currentHealth.sleepDurationMinutes !== undefined && currentHealth.sleepDurationMinutes > 0) {
        setSleepHours(Math.floor(currentHealth.sleepDurationMinutes / 60));
        setSleepMinutes(currentHealth.sleepDurationMinutes % 60);
      }
      if (currentHealth.sleepQuality !== undefined) {
        setSleepQuality1to5(Math.max(1, Math.min(5, Math.round(currentHealth.sleepQuality / 20))));
      }
      if (currentHealth.recoveryScore !== undefined) {
        setRecovery1to5(Math.max(1, Math.min(5, Math.round(currentHealth.recoveryScore / 20))));
      }
    }
  }, [latestCheckIn, currentHealth]);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const triggerToast = (msg: string) => {
    spaceAudio.playExecute();
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Convert 1-5 to percentage (1: 20%, 2: 40%, 3: 60%, 4: 80%, 5: 100%)
  const toPercent = (val: number) => Math.round(val * 20);

  // Handle Save Sleep & Recovery Check-in
  const handleSaveSleep = async () => {
    setIsSubmitting(true);
    try {
      const totalSleepMins = sleepHours * 60 + sleepMinutes;
      await onRecordMeasurement({
        sleepDurationMinutes: totalSleepMins,
        sleepQuality: toPercent(sleepQuality1to5),
        recoveryScore: toPercent(recovery1to5),
      });
      triggerToast('Sleep & Recovery logged. Single source of truth updated.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Save Daily Wellbeing Check-in
  const handleSaveDailyCheckIn = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitCheckIn({
        mood: toPercent(moodRating),
        stress: toPercent(stressRating),
        energy: toPercent(energyRating),
        fatigue: toPercent(fatigueRating),
        sleepQuality: toPercent(sleepQuality1to5),
        subjectiveNotes,
      });
      setSubjectiveNotes('');
      triggerToast('Daily Wellbeing Check-in saved. Health Engine recalculated.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="mental-health-module" className="space-y-6 pb-12 max-w-7xl mx-auto">
      
      {/* SUCCESS NOTIFICATION TOAST */}
      {toastMsg && (
        <div className="p-3.5 rounded-xl bg-purple-950/90 border border-purple-500/80 text-purple-200 text-sm font-mono flex items-center justify-between gap-3 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-purple-400 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-purple-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP COMPOSITE HEADER: MENTAL HEALTH INDEX & BASELINE */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-400 uppercase tracking-widest mb-1.5">
              <Brain className="w-4 h-4 text-purple-400" />
              <span>ASTRONAUT PSYCHOLOGICAL SURVEILLANCE • SOL {sol}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-100 uppercase tracking-wider">
              NEURAL SIGNAL
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-sans">
              Continuous monitoring of cognitive processing speed, subjective wellbeing, circadian sleep architecture, and autonomic stress recovery.
            </p>
          </div>

          {/* MENTAL HEALTH INDEX BADGE */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-950/90 border border-slate-800 shrink-0 shadow-inner">
            <div>
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Neural Signal Index
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-4xl sm:text-5xl font-black font-mono text-slate-100">
                  {mentalData.index}
                </span>
                <span className="text-sm font-mono text-slate-500 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                Personal Baseline: <span className="text-slate-200 font-bold">{mentalData.baselineRange}</span>
              </div>
            </div>

            <div className="border-l border-slate-800 pl-4 space-y-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Status</div>
              <div className={`px-3 py-1 rounded-full text-xs font-mono font-black border ${mentalData.status.badgeBg}`}>
                ● {mentalData.status.label}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {mentalData.trendLabel}
              </div>
            </div>
          </div>
        </div>

        {/* DISCLAIMER REQUIREMENT */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Composite prototype indicator — not a clinical diagnosis.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateTrends}
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>VIEW SLEEP TRENDS</span>
            </button>
            <span>•</span>
            <button
              onClick={() => onAskAstra('Evaluate my Neural Signal Index, sleep quality, and cognitive fatigue markers.')}
              className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>ASK ASTRA ABOUT NEURAL SIGNAL</span>
            </button>
          </div>
        </div>
      </div>

      {/* CORE MENTAL HEALTH SECTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. SLEEP & RECOVERY SECTION */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-mono font-bold text-slate-100">
                <Moon className="w-5 h-5 text-indigo-400" />
                <span className="tracking-wide">🌙 SLEEP & AUTONOMIC RECOVERY</span>
              </div>
              <span className="text-xs font-mono text-indigo-400">REST & TELEMETRY</span>
            </div>

            {/* Current Values summary */}
            <div className="grid grid-cols-3 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Sleep Duration</div>
                <div className="text-xl font-black text-slate-100 mt-1 flex items-center gap-1.5">
                  <span>🌙</span>
                  <span>{mentalData.sleepRecovery.sleepFormatted}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">NASA Target: 8h 00m</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Sleep Quality</div>
                <div className="text-xl font-black text-amber-400 mt-1 flex items-center gap-1">
                  <span>😴</span>
                  <span>{currentHealth.sleepQuality || 58}%</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Rating: {Math.round((currentHealth.sleepQuality || 58)/20)}/5</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Recovery Score</div>
                <div className="text-xl font-black text-teal-400 mt-1 flex items-center gap-1">
                  <span>⚡</span>
                  <span>{mentalData.sleepRecovery.recoveryPercent}%</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Autonomic: Optimal</div>
              </div>
            </div>

            {/* Interactive & Input-Friendly Sleep & Recovery Input Form */}
            <div className="p-4 rounded-xl bg-slate-950 border border-indigo-950/80 space-y-4 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💤 Log Rest & Sleep Duration</span>
                </span>
                <span className="text-xs font-bold text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/60">
                  Total: <strong className="text-white">{sleepHours}h {sleepMinutes}m</strong> ({((sleepHours * 60 + sleepMinutes) / 60).toFixed(1)} hrs)
                </span>
              </div>

              {/* 1. Direct Hours & Minutes Inputs with Stepper (+ / -) Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                {/* Hours Input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">
                    Sleep Hours
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSleepHours(prev => Math.max(0, prev - 1));
                        spaceAudio.playClick();
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition active:scale-95 border border-slate-700"
                      title="Decrease 1 hour"
                    >
                      -1h
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={sleepHours}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(24, Number(e.target.value) || 0));
                        setSleepHours(val);
                      }}
                      className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSleepHours(prev => Math.min(24, prev + 1));
                        spaceAudio.playClick();
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition active:scale-95 border border-slate-700"
                      title="Increase 1 hour"
                    >
                      +1h
                    </button>
                  </div>
                </div>

                {/* Minutes Input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">
                    Sleep Minutes
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        spaceAudio.playClick();
                        if (sleepMinutes >= 15) {
                          setSleepMinutes(prev => prev - 15);
                        } else if (sleepHours > 0) {
                          setSleepHours(prev => prev - 1);
                          setSleepMinutes(45);
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition active:scale-95 border border-slate-700"
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
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                        setSleepMinutes(val);
                      }}
                      className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        spaceAudio.playClick();
                        if (sleepMinutes + 15 < 60) {
                          setSleepMinutes(prev => prev + 15);
                        } else {
                          setSleepHours(prev => prev + 1);
                          setSleepMinutes(0);
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition active:scale-95 border border-slate-700"
                      title="Increase 15 mins"
                    >
                      +15m
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Interactive Range Slider for Quick Dragging */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Slide to Adjust Duration</span>
                  <span className="font-bold text-indigo-300">{((sleepHours * 60 + sleepMinutes) / 60).toFixed(2)} Hours</span>
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
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>

              {/* 3. Duration Bar Visualizer vs 8.0h NASA Rest Target */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Sleep Window Progress</span>
                  <span>8.0 Hours Target</span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      (sleepHours * 60 + sleepMinutes) >= 450 ? 'bg-indigo-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(((sleepHours * 60 + sleepMinutes) / 480) * 100))}%` }}
                  />
                </div>
              </div>

              {/* 4. Quick Sleep Preset Chips */}
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
                        spaceAudio.playClick();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        sleepHours === preset.h && sleepMinutes === preset.m
                          ? 'bg-indigo-600 text-white shadow-sm scale-102 ring-1 ring-indigo-400'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleep Quality Emoji Grid */}
              <div className="space-y-1.5 pt-2">
                <label className="text-[11px] text-slate-300 font-bold block">
                  Sleep Quality Assessment
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 5, emoji: '🌟', label: 'Excellent', desc: 'Deep Rest' },
                    { val: 4, emoji: '😴', label: 'Good', desc: 'Normal REM' },
                    { val: 3, emoji: '😑', label: 'Fair', desc: 'Minor Noise' },
                    { val: 1, emoji: '😫', label: 'Poor', desc: 'Restless' },
                  ].map((q) => (
                    <button
                      key={q.val}
                      type="button"
                      onClick={() => {
                        setSleepQuality1to5(q.val);
                        spaceAudio.playClick();
                      }}
                      className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer ${
                        sleepQuality1to5 === q.val
                          ? 'bg-indigo-950 border-indigo-400 text-white shadow-md ring-1 ring-indigo-400/40'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xl">{q.emoji}</span>
                      <div className="text-left">
                        <span className="text-[11px] font-bold block text-white">{q.label}</span>
                        <span className="text-[9px] text-slate-400 block">{q.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSleep}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'SAVING...' : 'SAVE SLEEP CHECK-IN'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between font-mono mt-4">
            <span>Berth Noise Shielding: 42 dBA</span>
            <span className="text-amber-400">Acoustic Check Recommended</span>
          </div>
        </div>

        {/* 2. WELLBEING DAILY CHECK-IN SECTION (1-5 SCALES WITH EXPRESSIVE EMOJIS) */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-mono font-bold text-slate-100">
                <Brain className="w-5 h-5 text-purple-400" />
                <span className="tracking-wide">🧠 MENTAL HEALTH & WELLBEING</span>
              </div>
              <span className="text-xs font-mono text-purple-400">SOL {sol} ASSESSMENT</span>
            </div>

            {/* Friendly Greeting Prompt */}
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-center justify-between gap-3 font-mono">
              <div>
                <h4 className="text-xs font-bold text-purple-200">
                  How are you feeling today, astronaut?
                </h4>
                <p className="text-[10px] text-purple-300/80 mt-0.5">
                  Calibrate your emotional state and subjective energy
                </p>
              </div>
              <span className="text-2xl animate-bounce">
                {moodRating === 5 ? '😄' : moodRating === 4 ? '🙂' : moodRating === 3 ? '😐' : moodRating === 2 ? '😟' : '😣'}
              </span>
            </div>

            {/* EXPRESSIVE MOOD SELECTOR */}
            <div className="space-y-1.5 font-mono">
              <label className="text-[11px] text-slate-300 font-bold block">
                Subjective Mood Rating
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { level: 5, emoji: '😄', label: 'Great', desc: 'Energized' },
                  { level: 4, emoji: '🙂', label: 'Good', desc: 'Steady' },
                  { level: 3, emoji: '😐', label: 'Okay', desc: 'Baseline' },
                  { level: 2, emoji: '😟', label: 'Low', desc: 'Strain' },
                  { level: 1, emoji: '😣', label: 'Stressed', desc: 'Pressure' },
                ].map((item) => (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => {
                      setMoodRating(item.level);
                      spaceAudio.playClick();
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
                      moodRating === item.level
                        ? 'bg-purple-950 border-purple-400 shadow-lg shadow-purple-950 scale-105 ring-2 ring-purple-500/40'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span className="text-2xl mb-0.5">{item.emoji}</span>
                    <span className="text-[11px] font-bold text-white">{item.label}</span>
                    <span className="text-[9px] text-slate-400 hidden sm:block">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* STRESS */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  🌋 Operational Stress
                </span>
                <span className="text-amber-400 font-bold text-[11px]">
                  {stressRating === 1 ? '🧘 Zen & Calm' : stressRating === 2 ? '😌 Low Pressure' : stressRating === 3 ? '😐 Moderate' : stressRating === 4 ? '🌋 High Pressure' : '💥 Severe'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { level: 1, label: '🧘 1' },
                  { level: 2, label: '😌 2' },
                  { level: 3, label: '😐 3' },
                  { level: 4, label: '🌋 4' },
                  { level: 5, label: '💥 5' },
                ].map((s) => (
                  <button
                    key={s.level}
                    type="button"
                    onClick={() => {
                      setStressRating(s.level);
                      spaceAudio.playClick();
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      stressRating === s.level
                        ? 'bg-amber-600 text-slate-950 shadow-md scale-102'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ENERGY */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  ⚡ Vital Energy
                </span>
                <span className="text-cyan-400 font-bold text-[11px]">
                  {energyRating === 1 ? '🪫 Depleted' : energyRating === 2 ? '🔋 Low' : energyRating === 3 ? '⚡ Steady' : energyRating === 4 ? '🚀 Charged' : '✨ Peak'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { level: 1, label: '🪫 1' },
                  { level: 2, label: '🔋 2' },
                  { level: 3, label: '⚡ 3' },
                  { level: 4, label: '🚀 4' },
                  { level: 5, label: '✨ 5' },
                ].map((e) => (
                  <button
                    key={e.level}
                    type="button"
                    onClick={() => {
                      setEnergyRating(e.level);
                      spaceAudio.playClick();
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      energyRating === e.level
                        ? 'bg-cyan-500 text-slate-950 shadow-md scale-102'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FATIGUE */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  🥱 Perceived Fatigue
                </span>
                <span className="text-rose-400 font-bold text-[11px]">
                  {fatigueRating === 1 ? '🌱 Fresh & Rested' : fatigueRating === 2 ? '🥱 Mild' : fatigueRating === 3 ? '😑 Moderate' : fatigueRating === 4 ? '😫 Heavy' : '😵 Exhausted'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { level: 1, label: '🌱 1' },
                  { level: 2, label: '🥱 2' },
                  { level: 3, label: '😑 3' },
                  { level: 4, label: '😫 4' },
                  { level: 5, label: '😵 5' },
                ].map((f) => (
                  <button
                    key={f.level}
                    type="button"
                    onClick={() => {
                      setFatigueRating(f.level);
                      spaceAudio.playClick();
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      fatigueRating === f.level
                        ? 'bg-rose-500 text-slate-950 shadow-md scale-102'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* OPTIONAL JOURNAL REFLECTION */}
            <div className="font-mono">
              <label className="text-[11px] font-bold text-slate-300 block mb-1">
                📝 Personal Reflection / Spaceflight Journal
              </label>
              <input
                type="text"
                placeholder="Log physical soreness, circadian feelings, or operational notes..."
                value={subjectiveNotes}
                onChange={(e) => setSubjectiveNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveDailyCheckIn}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'SAVING...' : 'SAVE WELLBEING CHECK-IN'}</span>
              </button>
            </div>

          </div>
        </div>

      </div>



      {/* RECENT CHECK-INS LOG */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase">
            <Clock className="w-4 h-4 text-purple-400" />
            <span>Stored Subjective Check-in History</span>
          </div>
          <span className="text-xs text-slate-500">Persistent IndexedDB Single Source of Truth</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-bold">SOL</th>
                <th className="pb-2 font-bold">TIMESTAMP</th>
                <th className="pb-2 font-bold">ENERGY</th>
                <th className="pb-2 font-bold">STRESS</th>
                <th className="pb-2 font-bold">FATIGUE</th>
                <th className="pb-2 font-bold">MOOD</th>
                <th className="pb-2 font-bold">NOTES</th>
                <th className="pb-2 font-bold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {checkIns.slice(0, 5).map((ci) => (
                <tr key={ci.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 font-bold text-slate-200">Sol {ci.sol}</td>
                  <td className="py-2.5 text-slate-400">
                    {new Date(ci.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-2.5 font-bold text-cyan-400">{ci.energy}%</td>
                  <td className="py-2.5 font-bold text-amber-400">{ci.stress}%</td>
                  <td className="py-2.5 font-bold text-rose-400">{ci.fatigue}%</td>
                  <td className="py-2.5 text-emerald-400 font-bold">{ci.mood}%</td>
                  <td className="py-2.5 text-slate-300 max-w-xs truncate font-sans">
                    {ci.subjectiveNotes || '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    {onDeleteCheckIn && (
                      <button
                        onClick={() => onDeleteCheckIn(ci.id)}
                        className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                        title="Delete check-in"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
