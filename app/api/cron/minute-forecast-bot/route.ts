import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { runMinuteForecastBot } from '@/lib/adminForecastBot/minuteForecastBot';
import { getProvidedCronSecret, isCronSecretValid } from '@/lib/cron/cronSecret';
import { tryAdvisoryLock, advisoryUnlock } from '@/lib/db/advisoryLock';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

// Stable bigint lock key for pg advisory lock (documented in SQL docs).
const BOT_LOCK_KEY = 913_220_177;

function floorToUtcMinute(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      0,
      0
    )
  );
}

function nextUtcMinuteBoundary(d: Date): Date {
  const floored = floorToUtcMinute(d);
  return new Date(floored.getTime() + 60_000);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handler(req: NextRequest) {
  const provided = getProvidedCronSecret(req);
  if (!isCronSecretValid(provided)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  // ============================
  // SLEEP FIRST (after auth)
  // IMPORTANT: don't hold advisory lock during sleep; it can cause missed minutes.
  // ============================
  const arrivedAt = new Date();
  const nextBoundary = nextUtcMinuteBoundary(arrivedAt);
  const waitMs = nextBoundary.getTime() - arrivedAt.getTime();

  // Always sleep forward unless already within 250ms of boundary
  let sleptMs = 0;
  if (waitMs > 250) {
    sleptMs = Math.min(waitMs, 55_000);
    console.log('[minute-bot] will-sleep', {
      arrivedAt: arrivedAt.toISOString(),
      nextBoundary: nextBoundary.toISOString(),
      waitMs,
      sleptMs,
    });
    await sleepMs(sleptMs);
  }

  const afterSleep = new Date();
  const t0 = floorToUtcMinute(afterSleep);
  const offsetMs = afterSleep.getTime() - t0.getTime();

  console.log('[minute-bot] aligned', {
    afterSleep: afterSleep.toISOString(),
    t0: t0.toISOString(),
    offsetMs,
  });

  const supabase = getServerClient();
  const lock = await tryAdvisoryLock(supabase, BOT_LOCK_KEY);
  if (!lock.ok) {
    return withNoStoreHeaders(
      NextResponse.json(
        { ok: false, error: lock.error, arrivedAt: arrivedAt.toISOString(), nextBoundary: nextBoundary.toISOString(), waitMs, sleptMs, afterSleep: afterSleep.toISOString(), t0: t0.toISOString(), offsetMs },
        { status: 500 }
      )
    );
  }
  if (!lock.acquired) {
    return withNoStoreHeaders(
      NextResponse.json(
        { ok: true, skipped: true, reason: 'lock_not_acquired', serverAsOf: new Date().toISOString(), arrivedAt: arrivedAt.toISOString(), nextBoundary: nextBoundary.toISOString(), waitMs, sleptMs, afterSleep: afterSleep.toISOString(), t0: t0.toISOString(), offsetMs },
        { status: 200 }
      )
    );
  }

  try {
    const result = await runMinuteForecastBot({ supabase, now: afterSleep, create: true });
    const status = result.ok ? 200 : (result.status ?? 500);

    const out = {
      ...result,
      // Proof fields
      arrivedAt: arrivedAt.toISOString(),
      nextBoundary: nextBoundary.toISOString(),
      waitMs,
      sleptMs,
      afterSleep: afterSleep.toISOString(),
      t0: t0.toISOString(),
      offsetMs,
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

