import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { runMinuteForecastBot } from '@/lib/adminForecastBot/minuteForecastBot';
import { getProvidedCronSecret, isCronSecretValid } from '@/lib/cron/cronSecret';
import { tryAdvisoryLock, advisoryUnlock } from '@/lib/db/advisoryLock';
import { floorToUtcMinute, nextUtcMinuteBoundary } from '@/lib/time/minuteBoundary';
import { sleepMs } from '@/lib/time/sleep';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 90;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

// Stable bigint lock key for pg advisory lock (documented in SQL docs).
const BOT_LOCK_KEY = 913_220_177;

async function handler(req: NextRequest) {
  const provided = getProvidedCronSecret(req);
  if (!isCronSecretValid(provided)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  const supabase = getServerClient();
  const lock = await tryAdvisoryLock(supabase, BOT_LOCK_KEY);
  if (!lock.ok) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: lock.error }, { status: 500 }));
  }
  if (!lock.acquired) {
    return withNoStoreHeaders(
      NextResponse.json(
        { ok: true, skipped: true, reason: 'lock_not_acquired', serverAsOf: new Date().toISOString() },
        { status: 200 }
      )
    );
  }

  let waitedMs = 0;
  try {
    const startedAt = new Date();
    const nextBoundary = nextUtcMinuteBoundary(startedAt);
    const msToNext = nextBoundary.getTime() - startedAt.getTime();

    // Sleep only when we're within ~7s of the next boundary.
    // If we already passed the boundary (cron late), do NOT sleep to the next minute (would make slippage worse).
    if (msToNext > 0 && msToNext <= 7000) {
      waitedMs = msToNext;
      await sleepMs(Math.min(msToNext, 55_000));
    }

    const now = new Date();
    const alignedTo = floorToUtcMinute(now).toISOString();

    const result = await runMinuteForecastBot({ supabase, now, create: true });
    const status = result.ok ? 200 : (result.status ?? 500);

    const out = {
      ...result,
      waitedMs,
      alignedTo,
    };

    return withNoStoreHeaders(NextResponse.json(out, { status }));
  } finally {
    await advisoryUnlock(supabase, BOT_LOCK_KEY);
  }
}

// Vercel Cron calls GET, but we support POST too for manual triggering.
export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

