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

function asBool(x: unknown): boolean | null {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'string') {
    if (x === 'true') return true;
    if (x === 'false') return false;
  }
  return null;
}

function asInt(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  if (!isFinite(n)) return null;
  return Math.floor(n);
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const { data, error } = await supabase.from('bot_settings').select('value, updated_at').eq('key', 'minute_bot').maybeSingle();
    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    const value = (data as any)?.value as any;
    const tradingEnabled = value?.tradingEnabled !== false;
    const predictionHorizonMinutes = clampInt(Number(value?.predictionHorizonMinutes ?? 1), 1, 60);
    const tradeFrequencyMinutes = clampInt(Number(value?.tradeFrequencyMinutes ?? 1), 1, 60);

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        tradingEnabled,
        predictionHorizonMinutes,
        tradeFrequencyMinutes,
        updatedAt: (data as any)?.updated_at ?? null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const body = (await req.json().catch(() => null)) as any;
    const maybeTradingEnabled = body?.tradingEnabled !== undefined ? asBool(body?.tradingEnabled) : null;
    const maybeHorizon = body?.predictionHorizonMinutes !== undefined ? asInt(body?.predictionHorizonMinutes) : null;
    const maybeFreq = body?.tradeFrequencyMinutes !== undefined ? asInt(body?.tradeFrequencyMinutes) : null;

    if (body?.tradingEnabled !== undefined && maybeTradingEnabled === null) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'tradingEnabled must be boolean' }, { status: 400 }));
    }
    if (body?.predictionHorizonMinutes !== undefined && (maybeHorizon === null || maybeHorizon < 1 || maybeHorizon > 60)) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'predictionHorizonMinutes must be integer 1..60' }, { status: 400 })
      );
    }
    if (body?.tradeFrequencyMinutes !== undefined && (maybeFreq === null || maybeFreq < 1 || maybeFreq > 60)) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'tradeFrequencyMinutes must be integer 1..60' }, { status: 400 })
      );
    }

    // Merge with existing value so partial updates work.
    const { data: existing, error: getErr } = await supabase.from('bot_settings').select('value').eq('key', 'minute_bot').maybeSingle();
    if (getErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: getErr.message }, { status: 500 }));
    const current = ((existing as any)?.value as any) ?? {};

    const nextValue = {
      tradingEnabled: maybeTradingEnabled ?? (current.tradingEnabled !== false),
      predictionHorizonMinutes: clampInt(Number(maybeHorizon ?? current.predictionHorizonMinutes ?? 1), 1, 60),
      tradeFrequencyMinutes: clampInt(Number(maybeFreq ?? current.tradeFrequencyMinutes ?? 1), 1, 60),
    };

    const row = { key: 'minute_bot', value: nextValue, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('bot_settings')
      .upsert(row, { onConflict: 'key' })
      .select('value, updated_at')
      .single();

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        tradingEnabled: ((data as any)?.value as any)?.tradingEnabled !== false,
        predictionHorizonMinutes: clampInt(Number(((data as any)?.value as any)?.predictionHorizonMinutes ?? 1), 1, 60),
        tradeFrequencyMinutes: clampInt(Number(((data as any)?.value as any)?.tradeFrequencyMinutes ?? 1), 1, 60),
        updatedAt: (data as any)?.updated_at ?? null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

