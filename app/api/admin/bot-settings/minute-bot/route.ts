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

export async function GET() {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const { data, error } = await supabase.from('bot_settings').select('value, updated_at').eq('key', 'minute_bot').maybeSingle();
    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    const value = (data as any)?.value as any;
    const tradingEnabled = value?.tradingEnabled !== false;

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        tradingEnabled,
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
    const nextVal = asBool(body?.tradingEnabled);
    if (nextVal === null) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'Body must be { tradingEnabled: boolean }' }, { status: 400 })
      );
    }

    const row = {
      key: 'minute_bot',
      value: { tradingEnabled: nextVal },
      updated_at: new Date().toISOString(),
    };

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
        updatedAt: (data as any)?.updated_at ?? null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

