import 'server-only';

import type { FinalAction } from './deriveFinalSignal';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Egypt-specific variance safety guard.
 *
 * Rules:
 * - If |variancePct| > 0.001 (0.1%) AND rawConfidence < 0.85 → force HOLD.
 * - If rawConfidence >= 0.85 → allow BUY/SELL but reduce confidence by 0.10.
 */
export function applyEgVarianceGuard(input: {
  rawConfidence: number;
  variancePct: number | null;
  finalAction: FinalAction;
  finalConfidence: number;
  reasons: string[];
}): { finalAction: FinalAction; finalConfidence: number; reasons: string[] } {
  const reasons = [...input.reasons];
  const variance = input.variancePct;
  const rawConf = clamp01(input.rawConfidence);
  let finalAction = input.finalAction;
  let finalConfidence = clamp01(input.finalConfidence);

  if (variance === null || !Number.isFinite(variance)) {
    return { finalAction, finalConfidence, reasons };
  }

  const absVar = Math.abs(variance);

  if (absVar > 0.001) {
    if (rawConf < 0.85) {
      // Force HOLD due to EG variance conflict
      if (finalAction !== 'HOLD') {
        finalAction = 'HOLD';
      }
      finalConfidence = clamp01(Math.max(0.4, rawConf * 0.75));
      reasons.push('eg_variance_conflict_hold');
    } else if (finalAction !== 'HOLD') {
      // Strong global signal: allow BUY/SELL but clip confidence
      finalConfidence = clamp01(Math.max(0, finalConfidence - 0.1));
      reasons.push('eg_variance_present_but_strong_global');
    }
  }

  return { finalAction, finalConfidence, reasons };
}

