import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { runAlpacaPaperLoop } from '@/lib/trading/alpaca/runPaperLoop';
import { getProvidedCronSecret, isCronRequestAuthorized } from '@/lib/cron/cronSecret';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

async function handler(req: NextRequest) {
  const provided = getProvidedCronSecret(req);
  if (!isCronRequestAuthorized(req, provided)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }
  const supabase = getServerClient();
  const result = await runAlpacaPaperLoop(supabase, new Date());
  return withNoStoreHeaders(NextResponse.json(result, { status: result.ok ? 200 : 500 }));
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

