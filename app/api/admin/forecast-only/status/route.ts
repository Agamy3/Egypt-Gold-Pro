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

function computeDirection(row: any): Direction {
  const predictedDir = String(row?.predicted_direction ?? '').toUpperCase();
  if (predictedDir === 'STALE') return 'STALE';

  const p0 = asNumber(row?.p0);
  const predictedPrice = asNumber(row?.predicted_price);
  if (p0 == null || p0 <= 0 || predictedPrice == null) return 'NA';

  const eps = 1e-9;
  if (Math.abs(predictedPrice - p0) <= eps) return 'TIE';
  return predictedPrice > p0 ? 'UP' : 'DOWN';
}

function providerFromSource(source: unknown): string | null {
  const s = String(source ?? '').toLowerCase();
  if (!s) return null;
  if (s.startsWith('gold_api_free')) return 'gold_api_free';
  if (s.startsWith('goldapi')) return 'goldapi';
  return s;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const url = new URL(request.url);
    const days = clampInt(Number(url.searchParams.get('days') ?? 7), 1, 30);
    const limit = clampInt(Number(url.searchParams.get('limit') ?? 1000), 1, 5000);
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch a bit more than requested so JS dedupe doesn't underfill the table if duplicates exist.
    const fetchLimit = clampInt(limit * 3, 1, 10_000);

    const { data, error } = await supabase
      .from('admin_30s_predictions')
      .select(
        'id, minute_key, p0, predicted_price, confidence, predicted_direction, source, created_at, p0_at, due_at, validated_at, result'
      )
      .gte('p0_at', sinceIso)
      .order('minute_key', { ascending: false })
      .order('p0_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    // Keep the first occurrence of each minute_key (already ordered newest-first).
    const seen = new Set<string>();
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
      const minuteKey = String(r?.minute_key ?? '');
      if (!minuteKey) continue;
      if (seen.has(minuteKey)) continue;
      seen.add(minuteKey);

      rows.push({
        minute_key: minuteKey,
        p0: asNumber(r?.p0),
        predicted_price: asNumber(r?.predicted_price),
        direction: computeDirection(r),
        confidence: asNumber(r?.confidence),
        provider: providerFromSource(r?.source),
        source: r?.source != null ? String(r.source) : null,
        created_at: String(r?.created_at ?? r?.p0_at ?? ''),
        updated_at: null, // table doesn't currently have updated_at
      });

      if (rows.length >= limit) break;
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

