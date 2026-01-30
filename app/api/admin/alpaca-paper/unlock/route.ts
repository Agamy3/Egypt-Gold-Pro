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

export async function POST(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('alpaca_paper_state')
      .update({ run_lock_until: nowIso, run_lock_token: null, updated_at: nowIso } as any)
      .eq('key', 'default')
      .select('key, run_lock_until')
      .maybeSingle();

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    return withNoStoreHeaders(NextResponse.json({ ok: true, serverAsOf: nowIso, state: data ?? null }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

