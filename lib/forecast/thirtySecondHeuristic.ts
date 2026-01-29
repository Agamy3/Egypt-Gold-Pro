/**
 * Deterministic 30-second heuristic for XAU/USD (GoldAPI quotes).
 *
 * Rules (exact):
 * 1) If stale => STALE
 * 2) delta = pNow - p30sAgo
 * 3) volatility = average(abs(diff consecutive)) from recentPrices (>=3)
 * 4) threshold = max(absoluteMin=0.10, k=1.5 * volatility)
 * 5) If abs(delta) < threshold => STALE
 * 6) Else delta > 0 => UP else DOWN
 */

export type ThirtySecondDirection = 'UP' | 'DOWN' | 'STALE';

export type ThirtySecondHeuristicMeta = {
  delta: number;
  volatility: number;
  threshold: number;
  absoluteMin: number;
  k: number;
  recentCount: number;
  p30sAgoAgeSec: number;
  quoteTimestampMs: number;
  staleAgeSec: number;
};

export function decideDirection(input: {
  isStale: boolean;
  pNow: number;
  p30sAgo: number;
  p30sAgoAtMs: number;
  recentPrices: number[];
  nowTsMs: number;
  quoteTimestampMs: number;
  absoluteMin?: number; // default 0.10
  k?: number; // default 1.5
}): { direction: ThirtySecondDirection; meta: ThirtySecondHeuristicMeta } {
  const absoluteMin = input.absoluteMin ?? 0.1;
  const k = input.k ?? 1.5;

  const staleAgeSec = Math.max(0, (input.nowTsMs - input.quoteTimestampMs) / 1000);
  const p30sAgoAgeSec = Math.max(0, (input.nowTsMs - input.p30sAgoAtMs) / 1000);

  if (input.isStale) {
    return {
      direction: 'STALE',
      meta: {
        delta: 0,
        volatility: 0,
        threshold: absoluteMin,
        absoluteMin,
        k,
        recentCount: input.recentPrices.length,
        p30sAgoAgeSec,
        quoteTimestampMs: input.quoteTimestampMs,
        staleAgeSec,
      },
    };
  }

  const prices = (input.recentPrices || []).map((n) => Number(n)).filter((n) => isFinite(n) && n > 0);
  let volatility = 0;
  if (prices.length >= 3) {
    let sum = 0;
    let cnt = 0;
    for (let i = 1; i < prices.length; i++) {
      const dv = Math.abs(prices[i] - prices[i - 1]);
      if (isFinite(dv)) {
        sum += dv;
        cnt += 1;
      }
    }
    volatility = cnt > 0 ? sum / cnt : 0;
  }

  const threshold = Math.max(absoluteMin, k * volatility);
  const delta = input.pNow - input.p30sAgo;

  const meta: ThirtySecondHeuristicMeta = {
    delta,
    volatility,
    threshold,
    absoluteMin,
    k,
    recentCount: prices.length,
    p30sAgoAgeSec,
    quoteTimestampMs: input.quoteTimestampMs,
    staleAgeSec,
  };

  if (Math.abs(delta) < threshold) {
    return { direction: 'STALE', meta };
  }
  return { direction: delta > 0 ? 'UP' : 'DOWN', meta };
}

