import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { runMinuteForecastBot } from '@/lib/adminForecastBot/minuteForecastBot';
import { tryAdvisoryLock, advisoryUnlock } from '@/lib/db/advisoryLock';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

const BOT_LOCK_KEY = 913_220_177;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const lock = await tryAdvisoryLock(supabase, BOT_LOCK_KEY);
    if (!lock.ok) return withNoStoreHeaders(NextResponse.json({ ok: false, error: lock.error }, { status: 500 }));
    if (!lock.acquired) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: true, skipped: true, reason: 'lock_not_acquired', serverAsOf: new Date().toISOString() })
      );
    }

    try {
      // Default: validation-only (recommended). Add ?create=1 to also create for current minute (still idempotent).
      const url = new URL(request.url);
      const create = url.searchParams.get('create') === '1';

      const result = await runMinuteForecastBot({ supabase, now: new Date(), create });
      const status = result.ok ? 200 : (result.status ?? 500);
      return withNoStoreHeaders(NextResponse.json(result, { status }));
    } finally {
      await advisoryUnlock(supabase, BOT_LOCK_KEY);
    }
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

