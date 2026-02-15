import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { cycleKeyUtc, isAsiaSessionUtc } from '@/lib/signals/cycle';
import { computeGoldAlgoSignal, median, type GoldSignalAction } from '@/lib/signals/goldAlgo';
import { computeEgVariancePct } from '@/lib/signals/egVariance';
import { getImpliedOunceWithCache } from '@/lib/goldapi';

type Country = 'GLOBAL' | 'EG';

const CYCLE_MINUTES = 5;
const HORIZON_MINUTES = 30;

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
    action: algo.action,
    confidence: algo.confidence,
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
    const { error } = await supabase.from('gold_signals').insert({ ...baseRow, country: 'GLOBAL', variance_pct: null });
    if (!error) created.push({ country: 'GLOBAL', action: algo.action, confidence: algo.confidence });
  }

  // EG (variance_pct only; action is the same algorithmically, but AI can downgrade/override)
  if (!existingCountries.has('EG')) {
    const variancePct = await computeEgVariancePct({ supabase, xauUsdPerOz: xauUsd }).catch(() => null);
    const { error } = await supabase.from('gold_signals').insert({ ...baseRow, country: 'EG', variance_pct: variancePct });
    if (!error) created.push({ country: 'EG', action: algo.action, confidence: algo.confidence });
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

