import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { runMinuteForecastBot } from '@/lib/adminForecastBot/minuteForecastBot';
import { getProvidedCronSecret, isCronSecretValid } from '@/lib/cron/cronSecret';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

async function handler(req: NextRequest) {
  const provided = getProvidedCronSecret(req);
  if (!isCronSecretValid(provided)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  const supabase = getServerClient();
  const result = await runMinuteForecastBot({ supabase, now: new Date() });
  const status = result.ok ? 200 : (result.status ?? 500);
  return withNoStoreHeaders(NextResponse.json(result, { status }));
}

// Vercel Cron calls GET, but we support POST too for manual triggering.
export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

