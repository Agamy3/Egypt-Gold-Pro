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
  volMedian: number;
  threshold: number;
  absoluteMin: number;
  k: number;
  recentCount: number;
  p30sAgoAgeSec: number;
  quoteTimestampMs: number;
  staleAgeSec: number;
  provider: 'goldapi' | 'gold_api_free';
};

export function decideDirection(input: {
  isStale: boolean;
  pNow: number;
  p30sAgo: number;
  p30sAgoAtMs: number;
  recentPrices: number[];
  nowTsMs: number;
  quoteTimestampMs: number;
  provider: 'goldapi' | 'gold_api_free';
  referenceMissing?: boolean;
  absoluteMin?: number; // default 0.10
  k?: number; // default 0.8
}): { direction: ThirtySecondDirection; meta: ThirtySecondHeuristicMeta } {
  const absoluteMin = input.absoluteMin ?? 0.1;
  const k = input.k ?? 0.8;

  const staleAgeSec = Math.max(0, (input.nowTsMs - input.quoteTimestampMs) / 1000);
  const p30sAgoAgeSec = Math.max(0, (input.nowTsMs - input.p30sAgoAtMs) / 1000);
  const referenceMissing = Boolean(input.referenceMissing);

  if (input.isStale) {
    return {
      direction: 'STALE',
      meta: {
        delta: 0,
        volMedian: 0,
        threshold: absoluteMin,
        absoluteMin,
        k,
        recentCount: input.recentPrices.length,
        p30sAgoAgeSec,
        quoteTimestampMs: input.quoteTimestampMs,
        staleAgeSec,
        provider: input.provider,
      },
    };
  }

  if (referenceMissing) {
    return {
      direction: 'STALE',
      meta: {
        delta: 0,
        volMedian: 0,
        threshold: absoluteMin,
        absoluteMin,
        k,
        recentCount: input.recentPrices.length,
        p30sAgoAgeSec,
        quoteTimestampMs: input.quoteTimestampMs,
        staleAgeSec,
        provider: input.provider,
      },
    };
  }

  const prices = (input.recentPrices || []).map((n) => Number(n)).filter((n) => isFinite(n) && n > 0);
  // Volatility: median(abs(diff consecutive)) (robust).
  const diffs: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const dv = Math.abs(prices[i] - prices[i - 1]);
    if (isFinite(dv)) diffs.push(dv);
  }
  diffs.sort((a, b) => a - b);
  const volMedian =
    diffs.length < 3
      ? 0
      : diffs.length % 2 === 0
        ? (diffs[diffs.length / 2 - 1] + diffs[diffs.length / 2]) / 2
        : diffs[Math.floor(diffs.length / 2)];

  const threshold = Math.max(absoluteMin, k * volMedian);
  const delta = input.pNow - input.p30sAgo;

  const meta: ThirtySecondHeuristicMeta = {
    delta,
    volMedian,
    threshold,
    absoluteMin,
    k,
    recentCount: prices.length,
    p30sAgoAgeSec,
    quoteTimestampMs: input.quoteTimestampMs,
    staleAgeSec,
    provider: input.provider,
  };

  if (Math.abs(delta) < threshold) {
    return { direction: 'STALE', meta };
  }
  return { direction: delta > 0 ? 'UP' : 'DOWN', meta };
}

