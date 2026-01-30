import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

type Direction = 'UP' | 'DOWN' | 'TIE' | 'STALE' | 'NA';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const url = new URL(request.url);
    const days = clampInt(Number(url.searchParams.get('days') ?? 7), 1, 30);
    const limit = clampInt(Number(url.searchParams.get('limit') ?? 1000), 1, 5000);
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('minute_forecasts')
      .select('minute_key, p0, predicted_price, direction, confidence, provider, source, created_at, updated_at')
      .gte('created_at', sinceIso)
      .order('minute_key', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    const rows: Array<{
      minute_key: string;
      p0: number | null;
      predicted_price: number | null;
      direction: Direction;
      confidence: number | null;
      provider: string | null;
      source: string | null;
      created_at: string;
      updated_at: string | null;
    }> = [];

    for (const r of (data || []) as any[]) {
      rows.push({
        minute_key: String(r?.minute_key ?? ''),
        p0: asNumber(r?.p0),
        predicted_price: asNumber(r?.predicted_price),
        direction: (String(r?.direction ?? 'NA') as Direction) || 'NA',
        confidence: asNumber(r?.confidence),
        provider: r?.provider != null ? String(r.provider) : null,
        source: r?.source != null ? String(r.source) : null,
        created_at: String(r?.created_at ?? ''),
        updated_at: r?.updated_at != null ? String(r.updated_at) : null,
      });
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        serverAsOf: new Date().toISOString(),
        params: { days, limit },
        rows,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

