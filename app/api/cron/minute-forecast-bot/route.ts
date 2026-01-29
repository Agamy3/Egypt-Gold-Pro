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
    const arrivedAt = new Date();

    // Always align forward to the NEXT UTC minute boundary unless we are basically on it already.
    let nextBoundary = nextUtcMinuteBoundary(arrivedAt);
    let waitMs = nextBoundary.getTime() - arrivedAt.getTime();

    // If something odd happens (shouldn't), recompute using "now".
    if (waitMs < 0) {
      const n = new Date();
      nextBoundary = nextUtcMinuteBoundary(n);
      waitMs = nextBoundary.getTime() - n.getTime();
    }

    // Sleep-to-boundary (can be up to ~60s). Cap each sleep chunk, but ensure we reach :00.
    if (waitMs > 10) {
      // Log once per run (minimal).
      console.log('[minute-bot] align sleep', {
        arrivedAt: arrivedAt.toISOString(),
        nextBoundary: nextBoundary.toISOString(),
        waitMs,
      });

      let remaining = waitMs;
      while (remaining > 10) {
        const chunk = Math.min(remaining, 55_000);
        waitedMs += chunk;
        await sleepMs(chunk);

        const after = new Date();
        const nb = nextUtcMinuteBoundary(after);
        remaining = nb.getTime() - after.getTime();
        // If we ended up exactly on the boundary (or very close), stop.
        if (remaining <= 10) break;
      }
    }

    const afterSleep = new Date();
    const t0 = floorToUtcMinute(afterSleep);
    console.log('[minute-bot] aligned', {
      afterSleep: afterSleep.toISOString(),
      t0: t0.toISOString(),
      offsetMs: afterSleep.getTime() - t0.getTime(),
      waitedMs,
    });

    const result = await runMinuteForecastBot({ supabase, now: afterSleep, create: true });
    const status = result.ok ? 200 : (result.status ?? 500);

    const out = {
      ...result,
      waitedMs,
      alignedTo: t0.toISOString(),
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

