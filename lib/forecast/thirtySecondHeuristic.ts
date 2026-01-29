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
  deltaObserved: number;
  volMedian: number;
  threshold: number;
  absoluteMin: number;
  k: number;
  recentCount: number;
  p30sAgoAgeSec: number;
  quoteTimestampMs: number;
  staleAgeSec: number;
  provider: 'goldapi' | 'gold_api_free';
  windowSeconds: number;
  referenceMissing: boolean;
  missingTimestamp: boolean;
};

export function decideDirection(input: {
  isStale: boolean;
  p0: number;
  p30sAgoPrice: number;
  p30sAgoAtMs: number;
  recentPrices: number[];
  nowTsMs: number;
  quoteTimestampMs: number;
  provider: 'goldapi' | 'gold_api_free';
  referenceMissing: boolean;
  missingTimestamp: boolean;
  absoluteMin?: number; // default 0.10
  k?: number; // default 0.8
  windowSeconds?: number; // default 60
}): {
  direction: ThirtySecondDirection;
  predicted_delta: number | null;
  predicted_price: number | null;
  confidence: number | null;
  expected_low: number | null;
  expected_high: number | null;
  meta: ThirtySecondHeuristicMeta;
} {
  const absoluteMin = input.absoluteMin ?? 0.1;
  const k = input.k ?? 0.8;
  const windowSeconds = input.windowSeconds ?? 60;

  const staleAgeSec = Math.max(0, (input.nowTsMs - input.quoteTimestampMs) / 1000);
  const p30sAgoAgeSec = Math.max(0, (input.nowTsMs - input.p30sAgoAtMs) / 1000);
  const referenceMissing = Boolean(input.referenceMissing);
  const missingTimestamp = Boolean(input.missingTimestamp);

  if (input.isStale) {
    return {
      direction: 'STALE',
      predicted_delta: null,
      predicted_price: null,
      confidence: null,
      expected_low: null,
      expected_high: null,
      meta: {
        deltaObserved: 0,
        volMedian: 0,
        threshold: absoluteMin,
        absoluteMin,
        k,
        recentCount: input.recentPrices.length,
        p30sAgoAgeSec,
        quoteTimestampMs: input.quoteTimestampMs,
        staleAgeSec,
        provider: input.provider,
        windowSeconds,
        referenceMissing,
        missingTimestamp,
      },
    };
  }

  if (referenceMissing) {
    return {
      direction: 'STALE',
      predicted_delta: null,
      predicted_price: null,
      confidence: null,
      expected_low: null,
      expected_high: null,
      meta: {
        deltaObserved: 0,
        volMedian: 0,
        threshold: absoluteMin,
        absoluteMin,
        k,
        recentCount: input.recentPrices.length,
        p30sAgoAgeSec,
        quoteTimestampMs: input.quoteTimestampMs,
        staleAgeSec,
        provider: input.provider,
        windowSeconds,
        referenceMissing,
        missingTimestamp,
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
  const deltaObserved = input.p0 - input.p30sAgoPrice;

  const meta: ThirtySecondHeuristicMeta = {
    deltaObserved,
    volMedian,
    threshold,
    absoluteMin,
    k,
    recentCount: prices.length,
    p30sAgoAgeSec,
    quoteTimestampMs: input.quoteTimestampMs,
    staleAgeSec,
    provider: input.provider,
    windowSeconds,
    referenceMissing,
    missingTimestamp,
  };

  if (Math.abs(deltaObserved) < threshold) {
    return {
      direction: 'STALE',
      predicted_delta: null,
      predicted_price: null,
      confidence: null,
      expected_low: null,
      expected_high: null,
      meta,
    };
  }

  // Numeric prediction block
  const strength = Math.max(0, Math.min(2, Math.abs(deltaObserved) / Math.max(threshold, 1e-9)));
  const confidence = Math.max(0, Math.min(1, strength / 2));
  const predicted_delta = Math.max(-2 * threshold, Math.min(2 * threshold, deltaObserved * 0.8));
  const predicted_price = input.p0 + predicted_delta;
  const band = Math.max(threshold, volMedian);
  const expected_low = predicted_price - band;
  const expected_high = predicted_price + band;

  return {
    direction: deltaObserved > 0 ? 'UP' : 'DOWN',
    predicted_delta,
    predicted_price,
    confidence,
    expected_low,
    expected_high,
    meta,
  };
}

