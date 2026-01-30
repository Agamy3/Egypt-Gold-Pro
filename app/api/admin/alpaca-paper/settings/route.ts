import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_UNIVERSE = ['SPY', 'QQQ', 'DIA', 'IWM', 'GLD', 'TLT', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'];

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function normalizeUniverse(input: unknown, fallback: string[]): string[] {
  let arr: unknown = input;

  if (arr == null) return [...fallback];

  if (typeof arr === 'string') {
    const s = arr.trim();
    if (!s) return [...fallback];

    // Try JSON first
    try {
      arr = JSON.parse(s);
    } catch {
      // CSV fallback
      arr = s.split(',').map((x) => x.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(arr)) return [...fallback];

  const cleaned = arr
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const deduped = Array.from(new Set(cleaned));
  return deduped.length > 0 ? deduped : [...fallback];
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const body = (await req.json().catch(() => null)) as any;

    // Validate inputs (partial updates allowed)
    const intervalSeconds = body?.interval_seconds != null ? clampInt(Number(body.interval_seconds), 60, 300) : null;
    const maxRisk = body?.max_risk_per_trade_pct != null ? clampNum(Number(body.max_risk_per_trade_pct), 0, 0.02) : null;
    const maxDD = body?.max_daily_drawdown_pct != null ? clampNum(Number(body.max_daily_drawdown_pct), 0, 0.05) : null;

    // Get current row to merge
    const { data: current, error: getErr } = await supabase
      .from('alpaca_paper_settings')
      .select('*')
      .eq('key', 'default')
      .maybeSingle();
    if (getErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: getErr.message }, { status: 500 }));

    const currentUniverse = normalizeUniverse((current as any)?.universe, DEFAULT_UNIVERSE);
    const parsedUniverse =
      body?.universe !== undefined ? normalizeUniverse(body.universe, currentUniverse) : currentUniverse;

    const row = {
      key: 'default',
      enabled: Boolean((current as any)?.enabled ?? false),
      interval_seconds: intervalSeconds ?? Number((current as any)?.interval_seconds ?? 60),
      max_risk_per_trade_pct: maxRisk ?? (asNum((current as any)?.max_risk_per_trade_pct) ?? 0.02),
      max_daily_drawdown_pct: maxDD ?? (asNum((current as any)?.max_daily_drawdown_pct) ?? 0.05),
      universe: parsedUniverse as any,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('alpaca_paper_settings')
      .upsert(row, { onConflict: 'key' })
      .select('*')
      .single();

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    return withNoStoreHeaders(NextResponse.json({ ok: true, settings: data }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

