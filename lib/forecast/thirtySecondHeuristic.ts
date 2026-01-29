/**
 * Deterministic 30-second heuristic for GLOBAL OUNCE (XAU/USD).
 *
 * Outputs one of:
 * - UP    => "Price will go up"
 * - DOWN  => "Price will go down"
 * - STALE => "No signal / data stale / do not trade"
 */

export type ThirtySecondDirection = 'UP' | 'DOWN' | 'STALE';

export type ThirtySecondHeuristicMeta = {
  delta: number;
  volatility: number;
  threshold: number;
  windowSeconds: number;
  referenceAgeSeconds: number;
  referencePointAt: string | null;
};

export function thirtySecondHeuristic(input: {
  isStale: boolean;
  latestPrice: number;
  latestAtMs: number;
  windowPoints: Array<{ t: number; v: number }>;
  horizonSeconds?: number; // default 30
  windowSeconds?: number; // default 120
  absoluteMin?: number; // default 0.05
  k?: number; // default 1.0
}): { direction: ThirtySecondDirection; meta: ThirtySecondHeuristicMeta } {
  const horizonSeconds = input.horizonSeconds ?? 30;
  const windowSeconds = input.windowSeconds ?? 120;
  const absoluteMin = input.absoluteMin ?? 0.05;
  const k = input.k ?? 1.0;

  if (input.isStale) {
    return {
      direction: 'STALE',
      meta: {
        delta: 0,
        volatility: 0,
        threshold: absoluteMin,
        windowSeconds,
        referenceAgeSeconds: 0,
        referencePointAt: null,
      },
    };
  }

  const points = (input.windowPoints || [])
    .filter((p) => isFinite(p.t) && p.t > 0 && isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);

  const nowMs = input.latestAtMs;
  const targetMs = nowMs - horizonSeconds * 1000;

  // Find a point approximately horizonSeconds ago.
  let ref = points.find((p) => p.t >= targetMs) ?? null;
  if (!ref && points.length > 0) ref = points[0];
  if (!ref) {
    return {
      direction: 'STALE',
      meta: {
        delta: 0,
        volatility: 0,
        threshold: absoluteMin,
        windowSeconds,
        referenceAgeSeconds: 0,
        referencePointAt: null,
      },
    };
  }

  // Volatility: median absolute diff between consecutive points.
  const diffs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dv = Math.abs(points[i].v - points[i - 1].v);
    if (isFinite(dv)) diffs.push(dv);
  }
  diffs.sort((a, b) => a - b);
  const volatility =
    diffs.length === 0
      ? 0
      : diffs.length % 2 === 0
        ? (diffs[diffs.length / 2 - 1] + diffs[diffs.length / 2]) / 2
        : diffs[Math.floor(diffs.length / 2)];

  const threshold = Math.max(absoluteMin, k * volatility);
  const delta = input.latestPrice - ref.v;

  const referenceAgeSeconds = Math.max(0, (nowMs - ref.t) / 1000);

  // No-signal rule => STALE
  if (Math.abs(delta) < threshold) {
    return {
      direction: 'STALE',
      meta: {
        delta,
        volatility,
        threshold,
        windowSeconds,
        referenceAgeSeconds,
        referencePointAt: new Date(ref.t).toISOString(),
      },
    };
  }

  return {
    direction: delta > 0 ? 'UP' : 'DOWN',
    meta: {
      delta,
      volatility,
      threshold,
      windowSeconds,
      referenceAgeSeconds,
      referencePointAt: new Date(ref.t).toISOString(),
    },
  };
}

