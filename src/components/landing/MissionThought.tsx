import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  getSessionMissionThought, 
  cycleMissionThought, 
  subscribeToMissionThought 
} from '../../services/missionThoughtService';
import { MissionThought as MissionThoughtType } from '../../data/missionThoughts';

interface MissionThoughtProps {
  sol?: number;
  metDays?: number;
}

const ROTATION_INTERVAL_MS = 8500; // 8.5s dynamic rotation
const FADE_DURATION_MS = 450;

export const MissionThought: React.FC<MissionThoughtProps> = () => {
  // Current active reflection
  const [thought, setThought] = useState<MissionThoughtType>(() => getSessionMissionThought());
  const [isFading, setIsFading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // System prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Smoothly transition to the next reflection
  const transitionToNext = useCallback((playSound: boolean = false) => {
    if (reducedMotion) {
      const next = cycleMissionThought(playSound);
      setThought(next);
      return;
    }

    setIsFading(true);
    setTimeout(() => {
      const next = cycleMissionThought(playSound);
      setThought(next);
      setIsFading(false);
    }, FADE_DURATION_MS);
  }, [reducedMotion]);

  // Handle manual click to immediately rotate
  const handleClick = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    transitionToNext(false);
  };

  // Subscribe to service updates (when changed across tabs/components)
  useEffect(() => {
    const unsubscribe = subscribeToMissionThought((newThought) => {
      setThought(newThought);
    });

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener?.('change', listener);

      const timer = setTimeout(() => {
        setHasLoaded(true);
      }, 50);

      return () => {
        clearTimeout(timer);
        mediaQuery.removeEventListener?.('change', listener);
        unsubscribe();
      };
    } else {
      setHasLoaded(true);
      return () => unsubscribe();
    }
  }, []);

  // Automatic dynamic rotation interval
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      transitionToNext(false);
    }, ROTATION_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPaused, transitionToNext]);

  const isVisible = hasLoaded && !isFading;

  return (
    <div 
      id="astra-mission-thought-hub"
      onClick={handleClick}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      className="group relative max-w-2xl mx-auto px-4 select-none cursor-pointer flex flex-col items-center justify-center transition-transform duration-300 hover:scale-[1.015]"
      title="Click for next reflection"
      aria-label="Mission Thought"
      aria-live="polite"
    >
      {/* Ultra-Clear Crystal Specular Edge Highlight */}
      <div 
        className="absolute -inset-0.5 rounded-full bg-white/[0.03] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
        aria-hidden="true"
      />

      {/* Ultra-Clear White Crystal Glass Capsule (Zero Blur & Maximum Globe Visibility) */}
      <div className="relative z-10 w-full px-5 py-3 sm:px-7 sm:py-3.5 rounded-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/30 group-hover:border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.15)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_6px_24px_rgba(255,255,255,0.08)] transition-all duration-300 flex items-center justify-center overflow-hidden">
        {/* Top Specular Crystal Edge Line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        
        {/* Subtle luminous beacon dot */}
        <span 
          className="hidden sm:inline-block w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#38bdf8] animate-pulse mr-3.5 shrink-0" 
          aria-hidden="true"
        />

        {/* The High-Contrast Lucrative Quote Line */}
        <blockquote 
          className={`text-center font-sans tracking-wide leading-relaxed transition-all duration-500 ${
            isVisible 
              ? 'opacity-100 translate-y-0 scale-100' 
              : 'opacity-0 -translate-y-1 scale-[0.98]'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <span className="text-cyan-300 font-serif text-lg sm:text-2xl mr-1 select-none drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]">“</span>
          <span className="text-base sm:text-lg md:text-xl font-normal bg-gradient-to-r from-white via-cyan-50 to-sky-100 bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] group-hover:drop-shadow-[0_0_18px_rgba(56,189,248,0.5)]">
            {thought.quote}
          </span>
          <span className="text-cyan-300 font-serif text-lg sm:text-2xl ml-1 select-none drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]">”</span>
        </blockquote>

        {/* Dynamic cycling beacon indicator */}
        <span 
          className="hidden sm:inline-block w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#38bdf8] animate-pulse ml-3.5 shrink-0" 
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

export default MissionThought;
