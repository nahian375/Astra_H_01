/**
 * ASTRA Health - Interactive Full-Body Anatomical Health Visualization
 * 
 * Design & Data Integrity Principles:
 * 1. 100% Data-Driven: Only includes interactive regions with real data collected in ASTRA Health:
 *    - WHOLE_BODY, BRAIN, HEART, LUNGS, MUSCLES, THERMOREGULATION_HYDRATION, RADIATION.
 *    - Unsupported organs (Liver, Kidneys, Stomach, Eyes) are excluded.
 * 2. Visual Alignment: Holographic astronaut suit wireframe aesthetic with glowing circular reticles
 *    matching deep-space flight HUDs (reference photo_2026-11-07_23-22-12_90f50189.jpg).
 * 3. Handles Empty Data: Displays explicit "No Recent Data" when metrics are missing.
 * 4. 100% Offline-First: Zero external network or 3D engine requirements.
 */

import React, { useState, useMemo } from 'react';
import { 
  Brain, 
  Heart, 
  Wind, 
  Activity, 
  Sparkles, 
  ArrowRight, 
  Dumbbell, 
  Radiation, 
  Flame, 
  Clock, 
  Database, 
  Info,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { HealthMeasurement, MetricBaseline, DailyCheckIn, RadiationMeasurement } from '../../types/health';
import { MedicalReportRecord, ExtractedLabResult } from '../../types/medicalReport';
import { getBodyHealthData, AnatomicalRegionId, AnatomicalRegionData } from '../../health/bodyHealthMapping';
import { HealthTabType } from '../modules/HealthView';
import { spaceAudio } from '../../utils/spaceAudio';

interface InteractiveBodyHealthProps {
  currentHealth?: HealthMeasurement;
  baselines?: MetricBaseline[];
  recentCheckIn?: DailyCheckIn;
  radiationMeasurements?: RadiationMeasurement[];
  medicalReports?: MedicalReportRecord[];
  laboratoryResults?: ExtractedLabResult[];
  onNavigateDomain?: (domain: HealthTabType) => void;
  onAskAstra?: (prompt: string) => void;
}

interface BodyNodeConfig {
  id: AnatomicalRegionId;
  name: string;
  cx: number;
  cy: number;
  r: number;
  icon: React.ReactNode;
  shortLabel: string;
  badgePosition: 'left' | 'right';
}

const SUPPORTED_BODY_NODES: BodyNodeConfig[] = [
  { id: 'BRAIN', name: 'Brain & Neural System', cx: 150, cy: 45, r: 16, icon: <Brain className="w-3.5 h-3.5" />, shortLabel: 'BRAIN / NEURAL', badgePosition: 'right' },
  { id: 'LUNGS', name: 'Lungs & Respiratory', cx: 132, cy: 122, r: 15, icon: <Wind className="w-3.5 h-3.5" />, shortLabel: 'LUNGS', badgePosition: 'left' },
  { id: 'HEART', name: 'Heart & Cardiovascular', cx: 168, cy: 128, r: 16, icon: <Heart className="w-3.5 h-3.5" />, shortLabel: 'CARDIOVASCULAR', badgePosition: 'right' },
  { id: 'THERMOREGULATION_HYDRATION', name: 'Thermoregulation & Hydration', cx: 150, cy: 175, r: 14, icon: <Flame className="w-3.5 h-3.5" />, shortLabel: 'THERMAL / FLUID', badgePosition: 'left' },
  { id: 'MUSCLES', name: 'Musculoskeletal System', cx: 182, cy: 260, r: 15, icon: <Dumbbell className="w-3.5 h-3.5" />, shortLabel: 'MUSCULOSKELETAL', badgePosition: 'right' },
  { id: 'RADIATION', name: 'Radiation Exposure Layer', cx: 118, cy: 260, r: 15, icon: <Radiation className="w-3.5 h-3.5" />, shortLabel: 'RADIATION LAYER', badgePosition: 'left' },
  { id: 'WHOLE_BODY', name: 'Whole Body Composite', cx: 150, cy: 375, r: 17, icon: <Sparkles className="w-3.5 h-3.5" />, shortLabel: 'WHOLE BODY', badgePosition: 'right' },
];

export const InteractiveBodyHealth: React.FC<InteractiveBodyHealthProps> = ({
  currentHealth,
  baselines,
  recentCheckIn,
  radiationMeasurements,
  medicalReports,
  laboratoryResults,
  onNavigateDomain,
  onAskAstra,
}) => {
  const [selectedRegion, setSelectedRegion] = useState<AnatomicalRegionId>('HEART');
  const [hoveredRegion, setHoveredRegion] = useState<AnatomicalRegionId | null>(null);

  // Unified data mapping from actual stored health data
  const bodyHealthData = useMemo(() => {
    return getBodyHealthData({
      currentHealth,
      baselines,
      recentCheckIn,
      radiationMeasurements,
      medicalReports,
      laboratoryResults,
    });
  }, [currentHealth, baselines, recentCheckIn, radiationMeasurements, medicalReports, laboratoryResults]);

  const activeRegionData: AnatomicalRegionData = bodyHealthData[selectedRegion] || bodyHealthData['WHOLE_BODY'];

  const handleSelectRegion = (id: AnatomicalRegionId) => {
    spaceAudio.playClick();
    setSelectedRegion(id);
  };

  const getNodeColor = (id: AnatomicalRegionId) => {
    const data = bodyHealthData[id];
    if (!data || !data.hasData) return '#64748b'; // slate-500 for no data
    if (data.status.label === 'STABLE') return '#10b981'; // emerald-500
    if (data.status.label === 'MONITOR') return '#f59e0b'; // amber-500
    return '#ef4444'; // rose-500
  };

  return (
    <section 
      id="interactive-body-health-visualization"
      aria-label="Interactive Data-Driven Astronaut Body Health Interface"
      className="w-full bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/90 p-5 sm:p-6 shadow-2xl relative overflow-hidden space-y-5"
    >
      {/* Top Specular Specular Crystal Edge Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/90 pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 font-bold uppercase tracking-widest mb-1">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>ASTRONAUT SUIT ANATOMICAL MAP • DATA-DRIVEN SURVEILLANCE</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-mono text-slate-100 uppercase tracking-wider">
            PHYSIOLOGICAL HUD VISUALIZATION
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Interactive astronaut suit HUD mapping exclusively the 7 data-backed physiological domains collected in ASTRA Health.
          </p>
        </div>

        {/* Quick Region Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none font-mono text-xs">
          {SUPPORTED_BODY_NODES.map((node) => {
            const data = bodyHealthData[node.id];
            const isSelected = selectedRegion === node.id;
            const hasData = data?.hasData;

            return (
              <button
                key={node.id}
                type="button"
                onClick={() => handleSelectRegion(node.id)}
                className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 font-bold ${
                  isSelected 
                    ? 'bg-cyan-500/20 border-cyan-400/80 text-cyan-200 shadow-md shadow-cyan-950/40' 
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  !hasData ? 'bg-slate-500' : data.status.label === 'STABLE' ? 'bg-emerald-400' : 'bg-amber-400'
                }`} />
                <span>{node.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN TWO-COLUMN CONTAINER: HOLOGRAPHIC SUIT (LEFT) + REGION DETAILS PANEL (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT COLUMN: HOLOGRAPHIC ASTRONAUT SUIT VISUALIZATION (5 COLS) */}
        <div className="lg:col-span-5 bg-slate-950/90 rounded-2xl border border-slate-800/90 p-4 relative flex flex-col items-center justify-between min-h-[480px] overflow-hidden shadow-inner group">
          
          {/* Subtle Cyber Radar Grid Lines */}
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:1.5rem_1.5rem]" />
          
          {/* Vertical Scanning Laser Line */}
          <div className="pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent shadow-[0_0_15px_rgba(6,182,212,0.8)] animate-[scan_6s_ease-in-out_infinite]" />

          {/* Top Canvas Header Bar */}
          <div className="w-full flex items-center justify-between font-mono text-[10px] text-slate-400 relative z-10 border-b border-slate-800/60 pb-2">
            <span className="flex items-center gap-1 text-cyan-400 font-bold">
              <Sparkles className="w-3 h-3" />
              <span>ASTRONAUT EVA SUIT HUD</span>
            </span>
            <span className="text-slate-500">SOL {currentHealth?.sol || 184} • DATA-BACKED REGIONS</span>
          </div>

          {/* HOLOGRAPHIC ASTRONAUT SUIT CANVAS WITH USER ASSET */}
          <div className="relative w-full max-w-[340px] aspect-[338/737] my-auto flex items-center justify-center rounded-xl overflow-hidden border border-cyan-900/60 shadow-2xl bg-slate-950">
            {/* The Actual User Provided Full-Body Astronaut Hologram Image */}
            <img 
              src="/assets/aistudio/image_25ee01e1.png"
              alt="Holographic Astronaut Suit Physiological HUD"
              className="absolute inset-0 w-full h-full object-cover object-center filter brightness-105 contrast-110 select-none pointer-events-none"
            />

            {/* Dark Vignette & Readability Gradient Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />

            {/* Interactive SVG HUD Overlay for 7 Data-Backed Physiological Domains */}
            <svg 
              viewBox="0 0 338 737" 
              className="absolute inset-0 w-full h-full select-none z-10"
            >
              <defs>
                <filter id="glowEffect" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* PULSING CARDIAC RETICLE OVER HEART ANATOMY */}
              <circle cx="178" cy="242" r="16" fill="#ef4444" opacity="0.25" className="animate-ping" />

              {/* SUPPORTED DATA-DRIVEN TARGET NODES */}
              {SUPPORTED_BODY_NODES.map((node) => {
                const isSelected = selectedRegion === node.id;
                const isHovered = hoveredRegion === node.id;
                const nodeColor = getNodeColor(node.id);
                const regionData = bodyHealthData[node.id];
                const hasData = regionData?.hasData;

                // Adjust vertical and horizontal mapping directly on 338x737 coordinates
                const coordMap: Record<AnatomicalRegionId, { cx: number; cy: number }> = {
                  BRAIN: { cx: 169, cy: 122 },
                  LUNGS: { cx: 140, cy: 236 },
                  HEART: { cx: 184, cy: 242 },
                  THERMOREGULATION_HYDRATION: { cx: 169, cy: 310 },
                  MUSCLES: { cx: 218, cy: 450 },
                  RADIATION: { cx: 120, cy: 450 },
                  WHOLE_BODY: { cx: 169, cy: 680 },
                };

                const coords = coordMap[node.id] || { cx: node.cx, cy: node.cy };

                return (
                  <g 
                    key={node.id} 
                    className="cursor-pointer group/node" 
                    onClick={() => handleSelectRegion(node.id)} 
                    onMouseEnter={() => setHoveredRegion(node.id)} 
                    onMouseLeave={() => setHoveredRegion(null)}
                  >
                    
                    {/* Active Circular HUD Dial Rings */}
                    {(isSelected || isHovered) && (
                      <g>
                        <circle
                          cx={coords.cx}
                          cy={coords.cy}
                          r={node.r + 10}
                          fill="none"
                          stroke={nodeColor}
                          strokeWidth="1.5"
                          strokeDasharray="6 3"
                          className="animate-[spin_6s_linear_infinite]"
                          filter="url(#glowEffect)"
                        />
                        <circle
                          cx={coords.cx}
                          cy={coords.cy}
                          r={node.r + 16}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="1"
                          opacity="0.6"
                          strokeDasharray="2 4"
                        />
                      </g>
                    )}

                    {/* Node Base Circle Target */}
                    <circle
                      cx={coords.cx}
                      cy={coords.cy}
                      r={node.r}
                      fill={isSelected ? nodeColor : 'rgba(15, 23, 42, 0.85)'}
                      stroke={hasData ? nodeColor : '#64748b'}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                      className="transition-all duration-300 shadow-lg"
                      filter="url(#glowEffect)"
                    />

                    {/* Center Point */}
                    <circle
                      cx={coords.cx}
                      cy={coords.cy}
                      r={3.5}
                      fill={isSelected ? '#ffffff' : (hasData ? nodeColor : '#94a3b8')}
                    />

                    {/* Leader Line to Floating Badge */}
                    <line
                      x1={coords.cx}
                      y1={coords.cy}
                      x2={node.badgePosition === 'right' ? coords.cx + 34 : coords.cx - 34}
                      y2={coords.cy}
                      stroke={isSelected ? nodeColor : '#0284c7'}
                      strokeWidth="1.2"
                      strokeDasharray={isSelected ? 'none' : '3 2'}
                      opacity="0.8"
                    />

                    {/* Floating HUD Badge Tag */}
                    <foreignObject
                      x={node.badgePosition === 'right' ? coords.cx + 36 : coords.cx - 105}
                      y={coords.cy - 12}
                      width="70"
                      height="26"
                    >
                      <div className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase transition-all shadow-md text-center border truncate backdrop-blur-sm ${
                        isSelected 
                          ? 'bg-cyan-500/40 border-cyan-400 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.6)]' 
                          : hasData 
                          ? 'bg-slate-950/90 border-cyan-800 text-cyan-300 group-hover/node:text-cyan-100 group-hover/node:border-cyan-400'
                          : 'bg-slate-950/70 border-slate-800 text-slate-500'
                      }`}>
                        {node.shortLabel}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom Canvas Legend */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 relative z-10 pt-2 border-t border-slate-800/60">
            <span className="text-[10px] text-slate-500">Tap HUD node to inspect telemetry</span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Recorded</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> No Data</span>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: CONTEXTUAL REGION HEALTH DETAILS PANEL (7 COLS) */}
        <div className="lg:col-span-7 bg-slate-950/90 rounded-2xl border border-slate-800/90 p-5 flex flex-col justify-between space-y-5 shadow-inner">
          
          {/* REGION HEADER & HEALTH INDEX SCORE */}
          <div className="space-y-3 border-b border-slate-800/90 pb-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 uppercase font-bold tracking-wider">
                  <span>{activeRegionData.systemCategory} DOMAIN</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">{activeRegionData.subtitle}</span>
                </div>
                <h3 className="text-2xl font-black font-mono text-slate-100 uppercase tracking-wide mt-0.5">
                  {activeRegionData.title}
                </h3>
              </div>

              {/* Status Badge & Score Capsule */}
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-xs font-mono font-black border ${activeRegionData.status.badgeBg} flex items-center gap-1.5`}>
                  <span className={`w-2 h-2 rounded-full ${activeRegionData.status.dotColor}`} />
                  <span>{activeRegionData.hasData ? activeRegionData.status.label : 'NO TELEMETRY'}</span>
                </div>

                <div className="px-3.5 py-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-right">
                  <div className="text-[9px] text-slate-400 uppercase">Domain Score</div>
                  <div className="text-lg font-black text-slate-100 leading-none mt-0.5">
                    {activeRegionData.healthIndexScore !== null ? (
                      <>
                        {activeRegionData.healthIndexScore} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500 font-normal">No Data</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Health Score Bar (if data exists) */}
            {activeRegionData.healthIndexScore !== null && (
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800/80">
                <div 
                  className={`h-full bg-gradient-to-r ${activeRegionData.status.barColor} transition-all duration-500`} 
                  style={{ width: `${activeRegionData.healthIndexScore}%` }}
                />
              </div>
            )}

            <p className="text-xs text-slate-300 font-sans">
              {activeRegionData.description}
            </p>
          </div>

          {/* PRIMARY METRICS BREAKDOWN LIST */}
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 uppercase">
              <span>Physiological Telemetry & Baseline Comparison</span>
              <span className="text-cyan-400">Stored ASTRA Vitals</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeRegionData.metrics.map((m) => (
                <div 
                  key={m.id}
                  className={`p-3.5 rounded-xl border space-y-2 font-mono transition-all ${
                    m.hasData 
                      ? 'bg-slate-900/90 border-slate-800/90 hover:border-slate-700' 
                      : 'bg-slate-950/60 border-slate-900 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] uppercase">
                    <span className={`font-bold truncate ${m.hasData ? 'text-slate-200' : 'text-slate-500'}`}>{m.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      !m.hasData ? 'bg-slate-950 text-slate-500 border-slate-800' :
                      m.status === 'NORMAL' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                    }`}>
                      {m.hasData ? m.status : 'NO DATA'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <div className="text-xl font-black text-slate-100 flex items-baseline gap-1">
                      <span className={m.hasData ? 'text-slate-100' : 'text-slate-500 font-normal text-sm'}>{m.valueDisplay}</span>
                      {m.hasData && <span className="text-xs font-normal text-slate-400">{m.unit}</span>}
                    </div>

                    {m.hasData && m.deviationPercent !== undefined && (
                      <div className={`text-xs font-bold flex items-center gap-0.5 ${
                        m.deviationPercent === 0 ? 'text-slate-400' :
                        m.deviationPercent > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {m.trend === 'UP' ? <TrendingUp className="w-3 h-3" /> : m.trend === 'DOWN' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        <span>{m.deviationPercent > 0 ? `+${m.deviationPercent}%` : `${m.deviationPercent}%`}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Baseline: <strong className="text-slate-300">{m.baselineDisplay}</strong></span>
                    <span className="text-[9px] text-slate-500">{m.source}</span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-sans line-clamp-2 leading-relaxed">
                    {m.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* DATA PROVENANCE & ACTION FOOTER */}
          <div className="pt-3 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Updated: <strong className="text-slate-200">{activeRegionData.lastUpdated}</strong></span>
              <span className="text-slate-600">•</span>
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeRegionData.source}</span>
            </div>

            <div className="flex items-center gap-2">
              {onAskAstra && (
                <button
                  type="button"
                  onClick={() => onAskAstra(`Analyze my ${activeRegionData.title} metrics and baseline deviation.`)}
                  className="px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-600/80 hover:bg-purple-900 text-purple-200 font-bold transition cursor-pointer flex items-center gap-1.5 text-xs shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>ASK ASTRA AI</span>
                </button>
              )}

              {onNavigateDomain && (
                <button
                  type="button"
                  onClick={() => onNavigateDomain(activeRegionData.targetDomain)}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black transition cursor-pointer flex items-center gap-1.5 text-xs shadow-md"
                >
                  <span>VIEW DETAILED MODULE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
