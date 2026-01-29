import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { runMinuteForecastBot } from '@/lib/adminForecastBot/minuteForecastBot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function POST() {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const result = await runMinuteForecastBot({ supabase, now: new Date() });
    const status = result.ok ? 200 : (result.status ?? 500);
    return withNoStoreHeaders(NextResponse.json(result, { status }));
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

