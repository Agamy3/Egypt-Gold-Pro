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

  const prevRaw = input.historyRaw?.[0]?.rawAction ?? 'HOLD';
  const prevRaw2 = input.historyRaw?.[1]?.rawAction ?? 'HOLD';
  const prevRawConf = clamp01(input.historyRaw?.[0]?.rawConfidence ?? 0);

  const riskyRegime = input.regimeNow === 'choppy' || input.regimeNow === 'volatile';

  let finalAction: FinalAction = prevFinal;
  let finalConfidence = clamp01(nowConf);
  let changeReason = 'unchanged';

  // Helper: strong flip eligibility (rule 3)
  const consecutiveOpposite =
    prevFinal !== 'HOLD' &&
    prevRaw === opposite(prevFinal) &&
    nowRaw === opposite(prevFinal) &&
    nowConf >= 0.8 &&
    !riskyRegime &&
    !input.chopDetectedNow &&
    !input.varianceConflictNow;

  // Rule 1: FAST INTERRUPT TO HOLD (risk-first)
  if (prevFinal === 'BUY' || prevFinal === 'SELL') {
    const rawOpposesPrev = nowRaw !== 'HOLD' && nowRaw !== prevFinal;

    const weakOpposition = rawOpposesPrev && !consecutiveOpposite;

    if (
      riskyRegime ||
      input.chopDetectedNow ||
      input.varianceConflictNow ||
      nowRaw === 'HOLD' ||
      weakOpposition
    ) {
      finalAction = 'HOLD';
      finalConfidence = Math.min(finalConfidence, 0.65);
      changeReason = 'risk_first_interrupt_to_hold';

      if (riskyRegime) guards.push(`regime_${input.regimeNow}_interrupt`);
      if (input.chopDetectedNow) guards.push('chop_interrupt');
      if (input.varianceConflictNow) guards.push('variance_interrupt');
      if (nowRaw === 'HOLD') guards.push('raw_hold_interrupt');
      if (weakOpposition) guards.push('weak_opposition_interrupt');
    } else if (consecutiveOpposite) {
      // Rule 3: DIRECT FLIP BUY <-> SELL (rare)
      finalAction = opposite(prevFinal);
      finalConfidence = Math.max(finalConfidence, 0.8);
      changeReason = 'direct_flip_strong';
      guards.push('direct_flip_strong');
    }
  }

  // Rule 2: SLOW ENTRY FROM HOLD INTO BUY/SELL (confirmation)
  if (prevFinal === 'HOLD') {
    const clean = !riskyRegime && !input.chopDetectedNow && !input.varianceConflictNow;
    const twoConsecutiveBuy = nowRaw === 'BUY' && prevRaw === 'BUY';
    const twoConsecutiveSell = nowRaw === 'SELL' && prevRaw === 'SELL';

    if (clean && nowConf >= 0.65 && (twoConsecutiveBuy || twoConsecutiveSell)) {
      finalAction = nowRaw;
      finalConfidence = Math.max(finalConfidence, 0.65);
      changeReason = 'confirmed_entry_from_hold';
      guards.push('confirmed_2x_raw');
    } else {
      // default HOLD if not confirmed
      finalAction = 'HOLD';
      // keep HOLD confidence conservative
      finalConfidence = Math.min(0.6, Math.max(0.25, Math.max(nowConf, prevRawConf)));
      if (!clean) guards.push('blocked_entry_risk');
      if (nowRaw !== 'HOLD' && nowConf < 0.65) guards.push('blocked_entry_low_conf');
      if (nowRaw !== prevRaw) guards.push('blocked_entry_not_consecutive');
    }
  }

  // AI integration (rule 4)
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
        finalConfidence = Math.min(finalConfidence, 0.65);
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

