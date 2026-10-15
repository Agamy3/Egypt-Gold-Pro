import { getServerClient } from '@/lib/supabase/server';
import { runGoldSignalsCron } from '@/lib/signals/goldCronEngine';
import { getProvidedCronSecret, isCronRequestAuthorized } from '@/lib/cron/cronSecret';
import { tryAdvisoryLock, advisoryUnlock } from '@/lib/db/advisoryLock';
import { sendTelegramSignalToEnabledUsers } from '@/lib/telegram/service';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getMultiCurrencyRates } from '@/lib/fx-multi';


function withNoStoreHeaders(res: Response) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

// Stable bigint lock key for pg advisory lock
const SIGNALS_LOCK_KEY = 772_019_450;

async function handler(req: Request) {
  const provided = getProvidedCronSecret(req);
  if (!isCronRequestAuthorized(req, provided)) {
    return withNoStoreHeaders(Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  const supabase = getServerClient();
  const lock = await tryAdvisoryLock(supabase, SIGNALS_LOCK_KEY);
  if (!lock.ok) return withNoStoreHeaders(Response.json({ ok: false, error: lock.error }, { status: 500 }));
  if (!lock.acquired) {
    return withNoStoreHeaders(Response.json({ ok: true, skipped: true, reason: 'lock_not_acquired' }, { status: 200 }));
  }

  try {
    const result = await runGoldSignalsCron({ supabase, now: new Date() });
    if (result.ok) {
      const createdSignal = result.created.find((s) => s.country === 'EG' && (s.action === 'BUY' || s.action === 'SELL'));
      if (createdSignal) {
        const { data: latestEg } = await supabase
          .from('gold_signals')
          .select('xau_usd, final_confidence0to1, variance_pct, cycle_started_at, meta')
          .eq('country', 'EG')
          .eq('cycle_key', result.cycleKey)
          .order('cycle_started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const xauUsd = latestEg ? Number((latestEg as any).xau_usd) : NaN;
        const conf = latestEg ? Number((latestEg as any).final_confidence0to1 ?? createdSignal.confidence) : createdSignal.confidence;
        const meta = (latestEg as any)?.meta || {};
        if (isFinite(xauUsd) && xauUsd > 0) {
          // Keep Telegram variance aligned with homepage/current market snapshot values.
          const [liveMarket, fx] = await Promise.all([
            getMarketMedians('EG', false, 120).catch(() => null),
            getMultiCurrencyRates().catch(() => null),
          ]);
          const liveLocal24 = liveMarket?.prices?.market24Buy ?? null;
          const liveLocal21 = liveMarket?.prices?.market21Buy ?? null;
          const usdEgp = fx?.usd_egp ?? null;
          const fair24Live =
            usdEgp && Number.isFinite(usdEgp) && usdEgp > 0
              ? (xauUsd / 31.1034768) * usdEgp
              : null;
          const varianceLive =
            fair24Live && Number.isFinite(fair24Live) && fair24Live > 0 && liveLocal24 && Number.isFinite(liveLocal24) && liveLocal24 > 0
              ? (liveLocal24 - fair24Live) / fair24Live
              : null;

          await sendTelegramSignalToEnabledUsers({
            action: createdSignal.action,
            xauUsd,
            confidence: isFinite(conf) ? conf : null,
            country: 'EG',
            local24: typeof liveLocal24 === 'number' ? liveLocal24 : (typeof meta.eg_local_24_latest === 'number' ? meta.eg_local_24_latest : null),
            local21: typeof liveLocal21 === 'number' ? liveLocal21 : (typeof meta.eg_local_21_latest === 'number' ? meta.eg_local_21_latest : null),
            variancePct:
              typeof varianceLive === 'number'
                ? varianceLive
                : (typeof (latestEg as any)?.variance_pct === 'number' ? Number((latestEg as any).variance_pct) : null),
            fair24Local:
              typeof fair24Live === 'number'
                ? fair24Live
                : (typeof meta.eg_fair_24_latest === 'number' ? meta.eg_fair_24_latest : null),
            timestampIso: (latestEg as any)?.cycle_started_at || new Date().toISOString(),
          });
        }
      }
    }
    const status = result.ok ? 200 : (result.status ?? 500);
    return withNoStoreHeaders(Response.json(result, { status }));
  } finally {
    await advisoryUnlock(supabase, SIGNALS_LOCK_KEY);
  }
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
