import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { runAlpacaPaperLoop } from '@/lib/trading/alpaca/runPaperLoop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

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
    const body = (await _req.json().catch(() => null)) as any;
    const force = Boolean(body?.force);
    const result = await runAlpacaPaperLoop(supabase, new Date(), { force });
    return withNoStoreHeaders(NextResponse.json(result, { status: result.ok ? 200 : 500 }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

