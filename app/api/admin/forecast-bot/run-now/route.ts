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

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    // Default: validation-only (recommended). Add ?create=1 to also create for current minute (still idempotent).
    const url = new URL(request.url);
    const create = url.searchParams.get('create') === '1';

    // Same alignment proof as cron.
    const arrivedAt = new Date();
    const nextBoundary = nextUtcMinuteBoundary(arrivedAt);
    const waitMs = nextBoundary.getTime() - arrivedAt.getTime();

    // IMPORTANT: don't hold advisory lock during sleep; it can block the next minute.
    let sleptMs = 0;
    if (waitMs > 250) {
      sleptMs = Math.min(waitMs, 55_000);
      console.log('[minute-bot][admin] will-sleep', {
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

    console.log('[minute-bot][admin] aligned', {
      afterSleep: afterSleep.toISOString(),
      t0: t0.toISOString(),
      offsetMs,
    });

    const supabase = getServerClient();
    const lock = await tryAdvisoryLock(supabase, BOT_LOCK_KEY);
    if (!lock.ok) return withNoStoreHeaders(NextResponse.json({ ok: false, error: lock.error }, { status: 500 }));
    if (!lock.acquired) {
      return withNoStoreHeaders(
        NextResponse.json({
          ok: true,
          skipped: true,
          reason: 'lock_not_acquired',
          serverAsOf: new Date().toISOString(),
          arrivedAt: arrivedAt.toISOString(),
          nextBoundary: nextBoundary.toISOString(),
          waitMs,
          sleptMs,
          afterSleep: afterSleep.toISOString(),
          t0: t0.toISOString(),
          offsetMs,
        })
      );
    }

    try {
      const result = await runMinuteForecastBot({ supabase, now: afterSleep, create });
      const status = result.ok ? 200 : (result.status ?? 500);
      return withNoStoreHeaders(
        NextResponse.json(
          {
            ...result,
            arrivedAt: arrivedAt.toISOString(),
            nextBoundary: nextBoundary.toISOString(),
            waitMs,
            sleptMs,
            afterSleep: afterSleep.toISOString(),
            t0: t0.toISOString(),
            offsetMs,
          },
          { status }
        )
      );
    } finally {
      await advisoryUnlock(supabase, BOT_LOCK_KEY);
    }
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

