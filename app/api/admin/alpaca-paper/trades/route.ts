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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const url = new URL(req.url);
    const limit = clampInt(Number(url.searchParams.get('limit') ?? 200), 1, 1000);

    const { data, error } = await supabase
      .from('alpaca_paper_trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    return withNoStoreHeaders(NextResponse.json({ ok: true, serverAsOf: new Date().toISOString(), trades: data ?? [] }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

