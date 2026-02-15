import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Country = 'GLOBAL' | 'EG';

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function parseCountry(raw: string | null): Country {
  return raw === 'EG' ? 'EG' : 'GLOBAL';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = parseCountry(searchParams.get('country'));

  const supabase = getServerClient();

  const [{ data: latest, error: latestErr }, { data: history, error: histErr }] = await Promise.all([
    supabase
      .from('gold_signals')
      .select(
        'cycle_key, cycle_started_at, country, action, confidence, raw_action, raw_confidence0to1, final_action, final_confidence0to1, final_changed_at, final_change_reason, pct_change_5m, volatility_proxy, asia_session, variance_pct, xau_usd, xau_timestamp_ms, meta, created_at, updated_at'
      )
      .eq('country', country)
      .order('cycle_started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('gold_signals')
      .select('cycle_key, cycle_started_at, action, confidence')
      .eq('country', country)
      .order('cycle_started_at', { ascending: false })
      .limit(12),
  ]);

  if (latestErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: latestErr.message }, { status: 500 }));
  if (histErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: histErr.message }, { status: 500 }));

  return withNoStoreHeaders(
    NextResponse.json(
      {
        ok: true,
        country,
        latest: latest ?? null,
        last_12_signals: (history ?? []).map((r: any) => ({
          cycle_key: String(r.cycle_key),
          action: String(r.action),
          confidence: Number(r.confidence),
        })),
        serverAsOf: new Date().toISOString(),
      },
      { status: 200 }
    )
  );
}

