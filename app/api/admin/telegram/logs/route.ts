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

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') ?? '50');
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));

    const { data, error } = await supabase
      .from('notification_deliveries_log')
      .select('id, created_at, user_id, rule_id, channel, status, payload, error')
      .eq('channel', 'telegram')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    }

    return withNoStoreHeaders(NextResponse.json({ ok: true, rows: data || [] }));
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
