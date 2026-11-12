/**
 * ASTRA Health - Neuro-Lab Cognitive Mathematics & Signal Detection Engine
 * Provides accurate, peer-reviewed computational formulas for:
 * - Reaction Time distribution (mean, median, fastest decile, lapse frequency)
 * - Signal Detection Theory d-prime (d') with Hautus (1995) log-linear correction
 * - Continuous Performance variability & vigilance decrement
 */

/**
 * Rational approximation of the inverse standard normal cumulative distribution function (probit)
 * Abramowitz and Stegun formula 26.2.23. Absolute error < 4.5e-4.
 */
export function normInv(p: number): number {
  if (p <= 0) return -4.5;
  if (p >= 1) return 4.5;

  // Symmetry about 0.5
  if (p < 0.5) {
    return -rationalApproximation(Math.sqrt(-2.0 * Math.log(p)));
  } else {
    return rationalApproximation(Math.sqrt(-2.0 * Math.log(1.0 - p)));
  }
}

function rationalApproximation(t: number): number {
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  return t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
}

/**
 * Calculates Signal Detection Theory Sensitivity (d')
 * Applies Hautus (1995) log-linear adjustment for extreme proportions (0 or 1)
 * avoids infinite z-scores when hit rate = 1.0 or false alarm rate = 0.0
 */
export function calculateDPrime(
  hits: number, 
  targets: number, 
  falseAlarms: number, 
  nonTargets: number
): number {
  if (targets <= 0 || nonTargets <= 0) return 0;

  // Hautus log-linear rule adds 0.5 to numerator, 1 to denominator
  const correctedHitRate = (hits + 0.5) / (targets + 1);
  const correctedFARate = (falseAlarms + 0.5) / (nonTargets + 1);

  const zHit = normInv(correctedHitRate);
  const zFA = normInv(correctedFARate);

  const dPrime = zHit - zFA;
  // Bound to biologically meaningful range [-3.5, 4.5]
  return Math.max(-3.5, Math.min(4.5, Number(dPrime.toFixed(2))));
}

/**
 * Computes mean of a number array
 */
export function calculateMean(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

/**
 * Computes median of a number array
 */
export function calculateMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

/**
 * Computes fastest 10% (optimum decile) reaction time
 */
export function calculateFastest10Percent(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const count10Pct = Math.max(1, Math.ceil(sorted.length * 0.10));
  const topSlice = sorted.slice(0, count10Pct);
  return calculateMean(topSlice);
}

/**
 * Computes sample standard deviation (Reaction Time Variability)
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
  return Math.round(Math.sqrt(variance));
}

/**
 * Determines readiness classification based on PVT reaction metrics
 */
export function classifyPvtReadiness(
  meanMs: number, 
  lapses: number, 
  falseStarts: number
): 'OPTIMAL' | 'NOMINAL' | 'FATIGUE_MONITOR' | 'ATTENTION_REQUIRED' {
  if (lapses >= 3 || falseStarts >= 4 || meanMs > 380) {
    return 'ATTENTION_REQUIRED';
  }
  if (lapses >= 1 || falseStarts >= 2 || meanMs > 280) {
    return 'FATIGUE_MONITOR';
  }
  if (meanMs <= 245 && lapses === 0 && falseStarts <= 1) {
    return 'OPTIMAL';
  }
  return 'NOMINAL';
}

/**
 * Determines readiness classification based on accuracy and d-prime
 */
export function classifyAccuracyReadiness(
  accuracyPct: number, 
  dPrime: number
): 'OPTIMAL' | 'NOMINAL' | 'FATIGUE_MONITOR' | 'ATTENTION_REQUIRED' {
  if (accuracyPct >= 92 && dPrime >= 2.5) return 'OPTIMAL';
  if (accuracyPct >= 80 && dPrime >= 1.6) return 'NOMINAL';
  if (accuracyPct >= 65) return 'FATIGUE_MONITOR';
  return 'ATTENTION_REQUIRED';
}
