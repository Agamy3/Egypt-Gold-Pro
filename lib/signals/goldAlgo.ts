import 'server-only';

export type GoldSignalAction = 'BUY' | 'SELL' | 'HOLD';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Minimal deterministic BUY/SELL/HOLD algorithm.
 *
 * Inputs are percent-like decimals (e.g. 0.001 = 0.1%).
 */
export function computeGoldAlgoSignal(input: {
  pctChange5m: number; // decimal pct (0.001 = +0.1%)
  volatilityProxy: number; // decimal pct proxy
}): { action: GoldSignalAction; confidence: number; threshold: number } {
  const pct = Number.isFinite(input.pctChange5m) ? input.pctChange5m : 0;
  const vol = Math.max(0, Number.isFinite(input.volatilityProxy) ? input.volatilityProxy : 0);

  // Threshold scales up slightly with volatility so we don't over-trade noisy regimes.
  const base = 0.0004; // 0.04%
  const threshold = Math.max(base, 2.5 * vol);

  if (Math.abs(pct) < threshold) {
    // HOLD confidence is higher when the move is small relative to threshold.
    const conf = clamp01(1 - Math.abs(pct) / Math.max(threshold, 1e-9));
    return { action: 'HOLD', confidence: conf, threshold };
  }

  const action: GoldSignalAction = pct > 0 ? 'BUY' : 'SELL';
  // Confidence scales with signal strength relative to threshold (cap quickly).
  const strength = Math.abs(pct) / Math.max(threshold, 1e-9);
  const confidence = clamp01(strength / 3);
  return { action, confidence, threshold };
}

export function median(values: number[]): number {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[mid];
}

