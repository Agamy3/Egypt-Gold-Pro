import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { DEFAULT_ALPACA_SETTINGS } from '@/lib/trading/alpaca/defaults';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function POST(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const nowIso = new Date().toISOString();

    const { data: settings, error: sErr } = await supabase
      .from('alpaca_paper_settings')
      .upsert(
        {
          key: 'default',
          enabled: DEFAULT_ALPACA_SETTINGS.enabled,
          interval_seconds: DEFAULT_ALPACA_SETTINGS.interval_seconds,
          max_risk_per_trade_pct: DEFAULT_ALPACA_SETTINGS.max_risk_per_trade_pct,
          max_daily_drawdown_pct: DEFAULT_ALPACA_SETTINGS.max_daily_drawdown_pct,
          universe: DEFAULT_ALPACA_SETTINGS.universe as any,
          updated_at: nowIso,
        },
        { onConflict: 'key' }
      )
      .select('*')
      .single();
    if (sErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: sErr.message }, { status: 500 }));

    // Also clear halted state + locks so you can run immediately after reset.
    const { data: state, error: stErr } = await supabase
      .from('alpaca_paper_state')
      .update({
        halted: false,
        halted_reason: null,
        last_run_at: null,
        last_run_minute_key: null,
        run_lock_until: null,
        run_lock_token: null,
        updated_at: nowIso,
      } as any)
      .eq('key', 'default')
      .select('*')
      .maybeSingle();
    if (stErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: stErr.message }, { status: 500 }));

    return withNoStoreHeaders(NextResponse.json({ ok: true, serverAsOf: nowIso, settings, state: state ?? null }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

