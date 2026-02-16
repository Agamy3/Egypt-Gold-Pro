import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { cycleKeyUtc, isAsiaSessionUtc } from '@/lib/signals/cycle';
import { computeGoldAlgoSignal, median, type GoldSignalAction } from '@/lib/signals/goldAlgo';
import { getImpliedOunceWithCache } from '@/lib/goldapi';
import { deriveFinalSignal, type FinalAction, type RawHistoryPoint, type Regime } from '@/lib/signals/deriveFinalSignal';
import { getMultiCurrencyRates } from '@/lib/fx-multi';
import { applyEgVarianceGuard } from '@/lib/signals/egVarianceGuard';

type Country = 'GLOBAL' | 'EG';

const CYCLE_MINUTES = 5;
const HORIZON_MINUTES = 30;

type FinalStateRow = {
  final_action: FinalAction;
  final_confidence0to1: number;
  final_changed_at: string;
  last_cycle_key: string;
};

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function computeOutcome(args: {
  action: GoldSignalAction;
  entry: number;
  exit: number;
}): { outcome: 'true' | 'false' | 'tie' | 'na'; pnlBp: number | null } {
  if (!Number.isFinite(args.entry) || !Number.isFinite(args.exit) || args.entry <= 0 || args.exit <= 0) {
    return { outcome: 'na', pnlBp: null };
  }
  const eps = 1e-12;
  if (Math.abs(args.exit - args.entry) <= eps) return { outcome: 'tie', pnlBp: 0 };
  if (args.action === 'HOLD') return { outcome: 'na', pnlBp: 0 };

  const ret = (args.exit - args.entry) / args.entry;
  const pnlBp = ret * 10_000 * (args.action === 'BUY' ? 1 : -1);

  if (args.action === 'BUY') return { outcome: args.exit > args.entry ? 'true' : 'false', pnlBp };
  if (args.action === 'SELL') return { outcome: args.exit < args.entry ? 'true' : 'false', pnlBp };
  return { outcome: 'na', pnlBp };
}

async function validateDueSignals(supabase: SupabaseClient, now: Date) {
  const nowIso = now.toISOString();

  const { data: due, error } = await supabase
    .from('gold_signals')
    .select('id, action, xau_usd, due_at')
    .is('validated_at', null)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(100);

  if (error) return { ok: false as const, error: error.message };
  if (!due || due.length === 0) return { ok: true as const, validated: 0 };

  // Single exit price for all due rows: use the same gold-api.com pipeline as dashboard (cached).
  const exitOunce = await getImpliedOunceWithCache();
  const exitPrice = exitOunce.data?.impliedOunceUsd ?? null;
  if (exitPrice === null) return { ok: false as const, error: exitOunce.error?.message ?? 'missing_exit_spot' };

  let validated = 0;
  for (const row of due as any[]) {
    const entry = Number(row.xau_usd);
    const { outcome, pnlBp } = computeOutcome({ action: row.action as GoldSignalAction, entry, exit: exitPrice });
    const { error: updErr } = await supabase
      .from('gold_signals')
      .update({
        validated_at: nowIso,
        xau_usd_exit: exitPrice,
        outcome,
        pnl_bp: pnlBp,
        updated_at: nowIso,
      })
      .eq('id', row.id);
    if (!updErr) validated += 1;
  }

  return { ok: true as const, validated };
}

async function computeVolatilityProxy(supabase: SupabaseClient): Promise<number> {
  // Use last ~8 cycles of GLOBAL signal quotes to compute median abs pct change between cycles.
  const { data, error } = await supabase
    .from('gold_signals')
    .select('xau_usd')
    .eq('country', 'GLOBAL')
    .order('cycle_started_at', { ascending: false })
    .limit(8);
  if (error || !data || data.length < 3) return 0;

  const prices = data
    .map((r: any) => Number(r.xau_usd))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .reverse();

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    changes.push(Math.abs((cur - prev) / prev));
  }
  return median(changes);
}

async function getPrevCyclePrice(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from('gold_signals')
    .select('xau_usd')
    .eq('country', 'GLOBAL')
    .order('cycle_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = data ? Number((data as any).xau_usd) : NaN;
  return Number.isFinite(p) && p > 0 ? p : null;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function classifyRegime(args: {
  volatilityProxy: number;
  rawActionsLatestToOlder: FinalAction[]; // include current raw at [0]
  pctChangesLatestToOlder: number[]; // include current at [0]
}): { regime: Regime; chopDetected: boolean; flipCount6: number } {
  const actions6 = args.rawActionsLatestToOlder.slice(0, 6);
  const pct6 = args.pctChangesLatestToOlder.slice(0, 6);

  let flipCount = 0;
  let prev: 'BUY' | 'SELL' | null = null;
  for (const a of actions6) {
    if (a === 'HOLD') continue;
    if (prev && a !== prev) flipCount += 1;
    prev = a as 'BUY' | 'SELL';
  }

  const absMean =
    pct6.length > 0 ? pct6.map((x) => Math.abs(Number.isFinite(x) ? x : 0)).reduce((s, v) => s + v, 0) / pct6.length : 0;

  const vol = Math.max(0, Number.isFinite(args.volatilityProxy) ? args.volatilityProxy : 0);
  const chopDetected = flipCount >= 3;

  if (chopDetected) return { regime: 'choppy', chopDetected, flipCount6: flipCount };
  if (vol >= 0.0012 || absMean >= 0.001) return { regime: 'volatile', chopDetected, flipCount6: flipCount };
  if (vol >= 0.00025 && flipCount <= 1) return { regime: 'trending', chopDetected, flipCount6: flipCount };
  return { regime: 'calm', chopDetected, flipCount6: flipCount };
}

async function getPrevFinalState(supabase: SupabaseClient, country: Country): Promise<FinalStateRow | null> {
  const { data } = await supabase
    .from('gold_signal_state')
    .select('final_action, final_confidence0to1, final_changed_at, last_cycle_key')
    .eq('country', country)
    .eq('asset', 'XAUUSD')
    .maybeSingle();
  if (data?.final_action && data.final_changed_at) {
    return {
      final_action: String((data as any).final_action) as FinalAction,
      final_confidence0to1: Number((data as any).final_confidence0to1),
      final_changed_at: String((data as any).final_changed_at),
      last_cycle_key: String((data as any).last_cycle_key),
    };
  }

  // fallback: last gold_signals row (if any)
  const { data: last } = await supabase
    .from('gold_signals')
    .select('final_action, final_confidence0to1, final_changed_at, cycle_key, action, confidence, created_at')
    .eq('country', country)
    .order('cycle_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return null;
  const final_action = (last as any).final_action ? (String((last as any).final_action) as FinalAction) : (String((last as any).action) as FinalAction);
  const final_changed_at =
    (last as any).final_changed_at ? String((last as any).final_changed_at) : String((last as any).created_at ?? new Date().toISOString());
  return {
    final_action,
    final_confidence0to1: Number((last as any).final_confidence0to1 ?? (last as any).confidence ?? 0),
    final_changed_at,
    last_cycle_key: String((last as any).cycle_key ?? ''),
  };
}

async function getRawHistory(supabase: SupabaseClient, country: Country, limit: number): Promise<RawHistoryPoint[]> {
  const { data } = await supabase
    .from('gold_signals')
    .select('cycle_key, raw_action, raw_confidence0to1, action, confidence')
    .eq('country', country)
    .order('cycle_started_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r: any) => {
    const a = (r.raw_action ?? r.action ?? 'HOLD') as FinalAction;
    const c = Number(r.raw_confidence0to1 ?? r.confidence ?? 0);
    return { cycle_key: String(r.cycle_key), rawAction: a, rawConfidence: clamp01(c) };
  });
}

async function getEgLocalKaratSeries(supabase: SupabaseClient, karat: 24 | 18): Promise<{
  latestPrice: number | null;
  latestAt: string | null;
  prevPrice: number | null;
  prevAt: string | null;
  pct: number | null;
}> {
  const { data: latest } = await supabase
    .from('market_snapshots_norm')
    .select('price, created_at')
    .eq('country', 'EG')
    .eq('karat', karat)
    .eq('trusted', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestPrice = latest ? Number((latest as any).price) : null;
  const latestAt = latest ? String((latest as any).created_at) : null;
  if (!latestAt || !Number.isFinite(Number(latestPrice)) || (latestPrice as number) <= 0) {
    return { latestPrice: null, latestAt: null, prevPrice: null, prevAt: null, pct: null };
  }

  const prevTargetIso = new Date(Date.parse(latestAt) - 300_000).toISOString();
  const { data: prev } = await supabase
    .from('market_snapshots_norm')
    .select('price, created_at')
    .eq('country', 'EG')
    .eq('karat', karat)
    .eq('trusted', true)
    .lte('created_at', prevTargetIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevPrice = prev ? Number((prev as any).price) : null;
  const prevAt = prev ? String((prev as any).created_at) : null;
  const pct = prevPrice && Number.isFinite(prevPrice) && prevPrice > 0 ? ((latestPrice as number) - prevPrice) / prevPrice : null;
  return { latestPrice: latestPrice as number, latestAt, prevPrice: prevPrice ?? null, prevAt, pct };
}

export type GoldSignalsCronRun = {
  ok: true;
  serverAsOf: string;
  cycleKey: string;
  cycleStartedAt: string;
  validatedCount: number;
  createdCount: number;
  created: Array<{ country: Country; action: GoldSignalAction; confidence: number }>;
} | { ok: false; error: string; status?: number };

export async function runGoldSignalsCron(input: { supabase: SupabaseClient; now?: Date }): Promise<GoldSignalsCronRun> {
  const supabase = input.supabase;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  // Step 1) Validate due signals (best-effort; don't block creation)
  const validatedRes = await validateDueSignals(supabase, now);
  const validatedCount = validatedRes.ok ? validatedRes.validated : 0;

  // Step 2) Create current cycle signals (GLOBAL + EG)
  const { cycleKey, cycleStartedAt } = cycleKeyUtc(now, CYCLE_MINUTES);

  const { data: existing } = await supabase
    .from('gold_signals')
    .select('country')
    .eq('cycle_key', cycleKey);
  const existingCountries = new Set<string>((existing || []).map((r: any) => String(r.country)));

  if (existingCountries.has('GLOBAL') && existingCountries.has('EG')) {
    return {
      ok: true,
      serverAsOf: nowIso,
      cycleKey,
      cycleStartedAt: cycleStartedAt.toISOString(),
      validatedCount,
      createdCount: 0,
      created: [],
    };
  }

  // Use the same gold-api.com ounce price as dashboard, via cached pipeline.
  const spot = await getImpliedOunceWithCache();
  const xauUsd = spot.data?.impliedOunceUsd ?? null;
  const xauTimestampMs = spot.data?.timestamp ?? null;
  if (xauUsd === null) {
    return { ok: false, error: spot.error?.message ?? 'missing_spot', status: 502 };
  }
  const prev = await getPrevCyclePrice(supabase);
  const pctChange5m = prev ? (xauUsd - prev) / prev : 0;
  const volatilityProxy = await computeVolatilityProxy(supabase);
  const asiaSession = isAsiaSessionUtc(now);

  const algo = computeGoldAlgoSignal({ pctChange5m, volatilityProxy });
  const dueAt = addMinutes(cycleStartedAt, HORIZON_MINUTES);

  const created: Array<{ country: Country; action: GoldSignalAction; confidence: number }> = [];

  const baseRow = {
    cycle_key: cycleKey,
    cycle_started_at: cycleStartedAt.toISOString(),
    action: algo.action, // raw (backward-compatible)
    confidence: algo.confidence, // raw (backward-compatible)
    raw_action: algo.action,
    raw_confidence0to1: algo.confidence,
    xau_usd: xauUsd,
    xau_timestamp_ms: xauTimestampMs,
    pct_change_5m: pctChange5m,
    volatility_proxy: volatilityProxy,
    asia_session: asiaSession,
    horizon_minutes: HORIZON_MINUTES,
    due_at: dueAt.toISOString(),
    meta: {
      threshold: algo.threshold,
      provider: 'gold-api.com',
    },
    updated_at: nowIso,
  };

  // GLOBAL
  if (!existingCountries.has('GLOBAL')) {
    const prevState = await getPrevFinalState(supabase, 'GLOBAL');
    const historyRaw = await getRawHistory(supabase, 'GLOBAL', 12);
    const regimeInfo = classifyRegime({
      volatilityProxy,
      rawActionsLatestToOlder: [algo.action, ...historyRaw.map((h) => h.rawAction)],
      pctChangesLatestToOlder: [pctChange5m, ...historyRaw.map((_) => 0)],
    });

    const derived = deriveFinalSignal({
      prevFinalAction: prevState?.final_action ?? 'HOLD',
      prevFinalChangedAt: prevState?.final_changed_at ?? null,
      rawActionNow: algo.action,
      rawConfidenceNow: algo.confidence,
      regimeNow: regimeInfo.regime,
      chopDetectedNow: regimeInfo.chopDetected,
      varianceConflictNow: false,
      ai: null,
      historyRaw,
    });

    const finalChangedAtIso = derived.changed ? cycleStartedAt.toISOString() : (prevState?.final_changed_at ?? cycleStartedAt.toISOString());

    const { error } = await supabase.from('gold_signals').insert({
      ...baseRow,
      country: 'GLOBAL',
      variance_pct: null,
      final_action: derived.finalAction,
      final_confidence0to1: derived.finalConfidence0to1,
      final_changed_at: finalChangedAtIso,
      final_change_reason: derived.changeReason,
      meta: {
        ...(baseRow as any).meta,
        regime: regimeInfo.regime,
        chopDetected: regimeInfo.chopDetected,
        final_guards: derived.guards,
      },
    });
    if (!error) created.push({ country: 'GLOBAL', action: derived.finalAction, confidence: derived.finalConfidence0to1 });

    if (!error) {
      await supabase.from('gold_signal_state').upsert(
        {
          country: 'GLOBAL',
          asset: 'XAUUSD',
          final_action: derived.finalAction,
          final_confidence0to1: derived.finalConfidence0to1,
          final_changed_at: finalChangedAtIso,
          last_cycle_key: cycleKey,
          updated_at: nowIso,
        },
        { onConflict: 'country,asset' }
      );
    }
  }

  // EG (variance_pct only; action is the same algorithmically, but AI can downgrade/override)
  if (!existingCountries.has('EG')) {
    const [eg24, eg18] = await Promise.all([getEgLocalKaratSeries(supabase, 24), getEgLocalKaratSeries(supabase, 18)]);

    const fx = await getMultiCurrencyRates().catch(() => null);
    const usdEgp = fx?.usd_egp ?? null;
    const usdPerGram24 = xauUsd / 31.1034768;
    const fair24Egp = usdEgp && Number.isFinite(usdEgp) && usdEgp > 0 ? usdPerGram24 * usdEgp : null;
    const variance24 =
      fair24Egp && eg24.latestPrice && Number.isFinite(eg24.latestPrice) && eg24.latestPrice > 0
        ? (eg24.latestPrice - fair24Egp) / fair24Egp
        : null;
    const fair18Egp = fair24Egp !== null ? fair24Egp * (18 / 24) : null;
    const variance18 =
      fair18Egp && eg18.latestPrice && Number.isFinite(eg18.latestPrice) && eg18.latestPrice > 0
        ? (eg18.latestPrice - fair18Egp) / fair18Egp
        : null;

    const divergence18vs24 =
      eg24.latestPrice && eg18.latestPrice
        ? (eg18.latestPrice - eg24.latestPrice * (18 / 24)) / (eg24.latestPrice * (18 / 24))
        : null;

    const varianceConflictNow =
      (variance24 !== null && Math.abs(variance24) > 0.001) ||
      (divergence18vs24 !== null && Math.abs(divergence18vs24) >= 0.0005);

    const prevState = await getPrevFinalState(supabase, 'EG');
    const historyRaw = await getRawHistory(supabase, 'EG', 12);
    const regimeInfo = classifyRegime({
      volatilityProxy,
      rawActionsLatestToOlder: [algo.action, ...historyRaw.map((h) => h.rawAction)],
      pctChangesLatestToOlder: [pctChange5m, ...historyRaw.map((_) => 0)],
    });

    const derived = deriveFinalSignal({
      prevFinalAction: prevState?.final_action ?? 'HOLD',
      prevFinalChangedAt: prevState?.final_changed_at ?? null,
      rawActionNow: algo.action,
      rawConfidenceNow: algo.confidence,
      regimeNow: regimeInfo.regime,
      chopDetectedNow: regimeInfo.chopDetected,
      varianceConflictNow,
      ai: null,
      historyRaw,
    });

    let finalAction = derived.finalAction;
    let finalConfidence = derived.finalConfidence0to1;
    let finalGuards = [...derived.guards];

    // Egypt-specific variance safety (C)
    const egGuardResult = applyEgVarianceGuard({
      rawConfidence: algo.confidence,
      variancePct: variance24,
      finalAction,
      finalConfidence,
      reasons: finalGuards,
    });
    finalAction = egGuardResult.finalAction;
    finalConfidence = egGuardResult.finalConfidence;
    finalGuards = egGuardResult.reasons;

    if (divergence18vs24 !== null && Math.abs(divergence18vs24) >= 0.0005) {
      finalConfidence = Math.max(0, finalConfidence - 0.05);
    }

    const finalChangedAtIso = derived.changed ? cycleStartedAt.toISOString() : (prevState?.final_changed_at ?? cycleStartedAt.toISOString());

    const { error } = await supabase.from('gold_signals').insert({
      ...baseRow,
      country: 'EG',
      variance_pct: variance24,
      final_action: finalAction,
      final_confidence0to1: finalConfidence,
      final_changed_at: finalChangedAtIso,
      final_change_reason: derived.changeReason,
      meta: {
        ...(baseRow as any).meta,
        regime: regimeInfo.regime,
        chopDetected: regimeInfo.chopDetected,
        varianceConflictNow,
        eg_local_24_latest: eg24.latestPrice,
        eg_local_24_latest_at: eg24.latestAt,
        eg_local_24_prev: eg24.prevPrice,
        eg_local_24_prev_at: eg24.prevAt,
        eg_local_24_pct: eg24.pct,
        eg_local_18_latest: eg18.latestPrice,
        eg_local_18_latest_at: eg18.latestAt,
        eg_local_18_prev: eg18.prevPrice,
        eg_local_18_prev_at: eg18.prevAt,
        eg_local_18_pct: eg18.pct,
        eg_variance18: variance18,
        eg_divergence18vs24: divergence18vs24,
        final_guards: finalGuards,
      },
    });
    if (!error) created.push({ country: 'EG', action: finalAction, confidence: finalConfidence });

    if (!error) {
      await supabase.from('gold_signal_state').upsert(
        {
          country: 'EG',
          asset: 'XAUUSD',
          final_action: finalAction,
          final_confidence0to1: finalConfidence,
          final_changed_at: finalChangedAtIso,
          last_cycle_key: cycleKey,
          updated_at: nowIso,
        },
        { onConflict: 'country,asset' }
      );
    }
  }

  return {
    ok: true,
    serverAsOf: nowIso,
    cycleKey,
    cycleStartedAt: cycleStartedAt.toISOString(),
    validatedCount,
    createdCount: created.length,
    created,
  };
}

