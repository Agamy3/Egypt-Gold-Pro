import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { runGoldSignalsCron } from '@/lib/signals/goldCronEngine';
import { getProvidedCronSecret, isCronRequestAuthorized } from '@/lib/cron/cronSecret';
import { tryAdvisoryLock, advisoryUnlock } from '@/lib/db/advisoryLock';
import { sendTelegramSignalToEnabledUsers } from '@/lib/telegram/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

// Stable bigint lock key for pg advisory lock
const SIGNALS_LOCK_KEY = 772_019_450;

async function handler(req: NextRequest) {
  const provided = getProvidedCronSecret(req);
  if (!isCronRequestAuthorized(req, provided)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  const supabase = getServerClient();
  const lock = await tryAdvisoryLock(supabase, SIGNALS_LOCK_KEY);
  if (!lock.ok) return withNoStoreHeaders(NextResponse.json({ ok: false, error: lock.error }, { status: 500 }));
  if (!lock.acquired) {
    return withNoStoreHeaders(NextResponse.json({ ok: true, skipped: true, reason: 'lock_not_acquired' }, { status: 200 }));
  }

  try {
    const result = await runGoldSignalsCron({ supabase, now: new Date() });
    if (result.ok) {
      const createdSignal = result.created.find((s) => s.country === 'EG' && (s.action === 'BUY' || s.action === 'SELL'));
      if (createdSignal) {
        const { data: latestEg } = await supabase
          .from('gold_signals')
          .select('xau_usd, final_confidence0to1, cycle_started_at, meta')
          .eq('country', 'EG')
          .eq('cycle_key', result.cycleKey)
          .order('cycle_started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const xauUsd = latestEg ? Number((latestEg as any).xau_usd) : NaN;
        const conf = latestEg ? Number((latestEg as any).final_confidence0to1 ?? createdSignal.confidence) : createdSignal.confidence;
        const meta = (latestEg as any)?.meta || {};
        if (isFinite(xauUsd) && xauUsd > 0) {
          await sendTelegramSignalToEnabledUsers({
            action: createdSignal.action,
            xauUsd,
            confidence: isFinite(conf) ? conf : null,
            country: 'EG',
            local24: typeof meta.eg_local_24_latest === 'number' ? meta.eg_local_24_latest : null,
            local21: typeof meta.eg_local_21_latest === 'number' ? meta.eg_local_21_latest : null,
            timestampIso: (latestEg as any)?.cycle_started_at || new Date().toISOString(),
          });
        }
      }
    }
    const status = result.ok ? 200 : (result.status ?? 500);
    return withNoStoreHeaders(NextResponse.json(result, { status }));
  } finally {
    await advisoryUnlock(supabase, SIGNALS_LOCK_KEY);
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

