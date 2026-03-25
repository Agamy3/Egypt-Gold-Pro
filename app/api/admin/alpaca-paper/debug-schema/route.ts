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

function getSupabaseHost(): string | null {
  const url = (process.env.SUPABASE_URL || '').trim();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const nowIso = new Date().toISOString();
    let lockSelectOk: boolean | null = null;
    let lockSelectError: string | null = null;
    let lockUpdateOk: boolean | null = null;
    let lockUpdateError: string | null = null;

    // PostgREST does NOT expose information_schema; instead we probe the column directly.
    try {
      const { error: selErr } = await supabase
        .from('alpaca_paper_state')
        .select('key, run_lock_until, run_lock_token')
        .eq('key', 'default')
        .maybeSingle();
      lockSelectOk = !selErr;
      lockSelectError = selErr ? selErr.message : null;
    } catch (e) {
      lockSelectOk = false;
      lockSelectError = e instanceof Error ? e.message : String(e);
    }

    try {
      const { error: updErr } = await supabase
        .from('alpaca_paper_state')
        .update({ run_lock_until: nowIso, updated_at: nowIso } as any)
        .eq('key', 'default');
      lockUpdateOk = !updErr;
      lockUpdateError = updErr ? updErr.message : null;
    } catch (e) {
      lockUpdateOk = false;
      lockUpdateError = e instanceof Error ? e.message : String(e);
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        serverAsOf: nowIso,
        supabaseHost: getSupabaseHost(),
        lockSelectOk,
        lockSelectError,
        lockUpdateOk,
        lockUpdateError,
        hint:
          (lockSelectOk === false || lockUpdateOk === false) && ((lockSelectError || '') + (lockUpdateError || '')).includes('run_lock_until')
            ? "If columns exist but lockUpdate fails, PostgREST schema cache is stale. Run `select pg_notify('pgrst','reload schema');` or restart Supabase API."
            : null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

