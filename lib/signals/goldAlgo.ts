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
  // Base threshold is 0.0002 (0.02%), with a small volatility-dependent uplift.
  const base = 0.0002; // 0.02%
  const rawThreshold = Math.max(base, 2.0 * vol);

  const absPct = Math.abs(pct);

  // Trending relaxation:
  // When volatility is in the \"trending\" band, allow slightly smaller moves (>= 0.00015)
  // to generate BUY/SELL instead of HOLD. This approximates a momentum/breakout rule.
  const trendingVol = vol >= 0.00025 && vol < 0.0012;
  const relaxedThreshold = 0.00015; // 0.015%

  let threshold = rawThreshold;
  if (trendingVol && absPct >= relaxedThreshold && absPct < rawThreshold) {
    threshold = relaxedThreshold;
  }

  if (absPct < threshold) {
    // HOLD confidence: high in quiet markets, falls off near the threshold.
    const ratio = absPct / Math.max(threshold, 1e-9);
    const conf = clamp01(0.35 + 0.65 * Math.pow(1 - ratio, 2));
    return { action: 'HOLD', confidence: conf, threshold };
  }

  const action: GoldSignalAction = pct > 0 ? 'BUY' : 'SELL';
  // BUY/SELL confidence S-curve: quickly reaches high confidence for strong moves.
  const strength = absPct / Math.max(threshold, 1e-9);
  const confidence = clamp01(0.55 + 0.45 * Math.tanh((strength - 1) * 1.4));
  return { action, confidence, threshold };
}

export function median(values: number[]): number {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[mid];
}

