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
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
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

    const { data: cols, error: colsErr } = await supabase
      .from('information_schema.columns')
      .select('column_name,data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'alpaca_paper_state')
      .order('ordinal_position', { ascending: true });

    // Try a tiny update using the new column to detect PostgREST schema cache staleness.
    let lockUpdateOk: boolean | null = null;
    let lockUpdateError: string | null = null;
    const nowIso = new Date().toISOString();
    try {
      const { error: updErr } = await supabase
        .from('alpaca_paper_state')
        .update({ run_lock_until: nowIso, updated_at: nowIso } as any)
        .eq('key', 'default')
        .select('key')
        .maybeSingle();
      lockUpdateOk = !updErr;
      lockUpdateError = updErr ? updErr.message : null;
    } catch (e) {
      lockUpdateOk = false;
      lockUpdateError = e instanceof Error ? e.message : String(e);
    }

    if (colsErr) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: colsErr.message }, { status: 500 }));
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        serverAsOf: nowIso,
        supabaseHost: getSupabaseHost(),
        columns: cols ?? [],
        lockUpdateOk,
        lockUpdateError,
        hint:
          lockUpdateOk === false && (lockUpdateError || '').includes('run_lock_until')
            ? "If columns exist but lockUpdate fails, PostgREST schema cache is stale. Run `select pg_notify('pgrst','reload schema');` or restart Supabase API."
            : null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

