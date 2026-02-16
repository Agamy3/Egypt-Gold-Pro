import 'server-only';

export type FinalAction = 'BUY' | 'SELL' | 'HOLD';
export type Regime = 'calm' | 'trending' | 'volatile' | 'choppy';

export type AiInput =
  | {
      enabled: boolean;
      action: FinalAction;
      confidence0to1: number;
    }
  | null;

export type RawHistoryPoint = {
  rawAction: FinalAction;
  rawConfidence: number;
  cycle_key: string;
};

export function deriveFinalSignal(input: {
  prevFinalAction: FinalAction;
  prevFinalChangedAt: string | null;
  rawActionNow: FinalAction;
  rawConfidenceNow: number;
  regimeNow: Regime;
  chopDetectedNow: boolean;
  varianceConflictNow: boolean;
  ai: AiInput;
  historyRaw: RawHistoryPoint[]; // latest->older, excludes current cycle
}): {
  finalAction: FinalAction;
  finalConfidence0to1: number;
  changed: boolean;
  changeReason: string;
  guards: string[];
} {
  const guards: string[] = [];

  const prevFinal = input.prevFinalAction;
  const nowRaw = input.rawActionNow;
  const nowConf = clamp01(input.rawConfidenceNow);

  const h0 = input.historyRaw?.[0];
  const h1 = input.historyRaw?.[1];
  const prevRaw = h0?.rawAction ?? 'HOLD';
  const prevRawConf = clamp01(h0?.rawConfidence ?? 0);
  const prev2Raw = h1?.rawAction ?? 'HOLD';
  const prev2RawConf = clamp01(h1?.rawConfidence ?? 0);

  const riskyRegime = input.regimeNow === 'choppy' || input.regimeNow === 'volatile';

  let finalAction: FinalAction = prevFinal;
  let finalConfidence = nowConf;
  let changeReason = 'unchanged';

  // ---------- ENTRY LOGIC (prevFinal === HOLD) ----------
  if (prevFinal === 'HOLD') {
    if (nowRaw === 'BUY' || nowRaw === 'SELL') {
      const twoConsecutiveSame =
        prevRaw === nowRaw && nowConf >= 0.7 && prevRawConf >= 0.7;

      const strongFastTrack = nowConf >= 0.85;

      if (strongFastTrack) {
        // PATH 2: Strong-signal fast-track (single-cycle)
        finalAction = nowRaw;
        finalConfidence = nowConf;
        changeReason = 'fast_track_strong_signal';
        guards.push('fast_track_strong_signal');
      } else if (twoConsecutiveSame) {
        // PATH 1: Conservative confirmation (2x same direction)
        finalAction = nowRaw;
        finalConfidence = Math.min(nowConf, prevRawConf);
        changeReason = 'confirm_2x_same_direction';
        guards.push('confirm_2x_same_direction');
      } else {
        // Not strong enough or not confirmed → stay in HOLD
        finalAction = 'HOLD';
        finalConfidence = clamp01(Math.max(0.4, nowConf * 0.75));
        changeReason = 'hold_due_to_low_confidence';
        guards.push('hold_due_to_low_confidence');
      }
    } else {
      // Raw HOLD → remain HOLD with conservative confidence
      finalAction = 'HOLD';
      finalConfidence = clamp01(Math.max(0.4, nowConf * 0.75));
      changeReason = 'hold_due_to_low_confidence';
      guards.push('hold_due_to_low_confidence');
    }
  } else {
    // ---------- ACTIVE STATE (prevFinal is BUY or SELL) ----------
    // Risk brake: choppy/volatile regime with insufficient confidence forces HOLD
    if (riskyRegime && nowConf < 0.85) {
      finalAction = 'HOLD';
      finalConfidence = clamp01(Math.max(0.4, nowConf * 0.75));
      if (input.regimeNow === 'choppy') {
        changeReason = 'risk_brake_regime_choppy';
        guards.push('risk_brake_regime_choppy');
      } else {
        changeReason = 'risk_brake_regime_volatile';
        guards.push('risk_brake_regime_volatile');
      }
    } else {
      const opp = opposite(prevFinal);
      const isFlipNow = nowRaw === opp;

      // Reversal candidates
      const breakout3cycle =
        isFlipNow && prevRaw === opp && prev2Raw === opp;

      const twoOppositeHighConf =
        isFlipNow &&
        prevRaw === opp &&
        nowConf >= 0.75 &&
        prevRawConf >= 0.75;

      const fastReversal = isFlipNow && nowConf >= 0.9 && breakout3cycle;

      if (isFlipNow) {
        // Reversal hysteresis logic
        if (twoOppositeHighConf) {
          finalAction = opp;
          finalConfidence = Math.min(nowConf, prevRawConf);
          changeReason = 'reversal_confirmed_2x';
          guards.push('reversal_confirmed_2x');
        } else if (fastReversal) {
          finalAction = opp;
          finalConfidence = nowConf;
          changeReason = 'reversal_fast_track';
          guards.push('reversal_fast_track');
        } else {
          // Direct flip blocked → go through HOLD
          finalAction = 'HOLD';
          finalConfidence = clamp01(Math.max(0.4, nowConf * 0.75));
          changeReason = 'flip_blocked_go_through_hold';
          guards.push('flip_blocked_go_through_hold');
        }
      } else {
        // No explicit reversal condition met → maintain existing state (hysteresis)
        finalAction = prevFinal;
        // If raw supports the same direction, mirror its confidence; otherwise, dampen.
        if (nowRaw === prevFinal) {
          finalConfidence = nowConf;
        } else {
          finalConfidence = clamp01(Math.max(0.4, nowConf * 0.75));
        }
        // changeReason stays 'unchanged'
      }
    }
  }

  // ---------- AI INTEGRATION ----------
  const ai = input.ai;
  if (ai?.enabled) {
    const aiConf = clamp01(ai.confidence0to1);
    if (aiConf >= 0.8) {
      if (ai.action !== finalAction) {
        finalAction = ai.action;
        finalConfidence = Math.max(finalConfidence, aiConf);
        changeReason = 'ai_override_high_conf';
        guards.push('ai_override_high_conf');
      }
    } else {
      // low-confidence AI can only force HOLD
      if (ai.action === 'HOLD' && finalAction !== 'HOLD') {
        finalAction = 'HOLD';
        finalConfidence = clamp01(Math.max(0.4, finalConfidence * 0.9));
        changeReason = 'ai_risk_brake_hold';
        guards.push('ai_risk_brake_hold');
      } else if (ai.action !== 'HOLD') {
        guards.push('ai_low_conf_ignored');
      }
    }
  }

  const changed = finalAction !== prevFinal;
  if (!changed) changeReason = 'unchanged';

  return {
    finalAction,
    finalConfidence0to1: clamp01(finalConfidence),
    changed,
    changeReason,
    guards,
  };
}

function opposite(a: FinalAction): FinalAction {
  if (a === 'BUY') return 'SELL';
  if (a === 'SELL') return 'BUY';
  return 'HOLD';
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

