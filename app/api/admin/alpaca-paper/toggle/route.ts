import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const body = (await req.json().catch(() => null)) as any;
    const enabled = asBool(body?.enabled);
    if (enabled === null) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Body must be { enabled: boolean }' }, { status: 400 }));
    }

    const { data: current, error: getErr } = await supabase
      .from('alpaca_paper_settings')
      .select('*')
      .eq('key', 'default')
      .maybeSingle();
    if (getErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: getErr.message }, { status: 500 }));

    const { data, error } = await supabase
      .from('alpaca_paper_settings')
      .upsert(
        {
          ...(current ?? { key: 'default' }),
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )
      .select('*')
      .single();

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    // If starting, clear halted state. If stopping, don't change halted state.
    if (enabled) {
      await supabase
        .from('alpaca_paper_state')
        .upsert({ key: 'default', halted: false, halted_reason: null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }

    return withNoStoreHeaders(NextResponse.json({ ok: true, settings: data }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

