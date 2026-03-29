import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { runGoldSignalsCron } from '@/lib/signals/goldCronEngine';
import { sendTelegramSignalToEnabledUsers } from '@/lib/telegram/service';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getMultiCurrencyRates } from '@/lib/fx-multi';
import { isTelegramAutomationEnabled } from '@/lib/telegram/automationSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

async function runGoldSignalsWithTelegram(supabase: ReturnType<typeof getServerClient>) {
  const cron = await runGoldSignalsCron({ supabase, now: new Date() });
  if (!cron.ok) return { ok: false as const, error: cron.error, detail: cron };

  const canSend = await isTelegramAutomationEnabled(supabase, 'gold_signals');
  if (!canSend) {
    return {
      ok: true as const,
      telegramSkipped: true,
      cron,
    };
  }

  const createdSignal = cron.created.find((s) => s.country === 'EG' && (s.action === 'BUY' || s.action === 'SELL'));
  if (!createdSignal) {
    return { ok: true as const, telegramSkipped: true, reason: 'no_buy_sell_created', cron };
  }

  const { data: latestEg } = await supabase
    .from('gold_signals')
    .select('xau_usd, final_confidence0to1, variance_pct, cycle_started_at, meta')
    .eq('country', 'EG')
    .eq('cycle_key', cron.cycleKey)
    .order('cycle_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const xauUsd = latestEg ? Number((latestEg as any).xau_usd) : NaN;
  const conf = latestEg ? Number((latestEg as any).final_confidence0to1 ?? createdSignal.confidence) : createdSignal.confidence;
  const meta = (latestEg as any)?.meta || {};

  if (!isFinite(xauUsd) || xauUsd <= 0) {
    return { ok: true as const, telegramSkipped: true, reason: 'missing_xau_usd', cron };
  }

  const [liveMarket, fx] = await Promise.all([
    getMarketMedians('EG', false, 120).catch(() => null),
    getMultiCurrencyRates().catch(() => null),
  ]);

  const liveLocal24 = liveMarket?.prices?.market24Buy ?? null;
  const liveLocal21 = liveMarket?.prices?.market21Buy ?? null;
  const usdEgp = fx?.usd_egp ?? null;
  const fair24Live = usdEgp && Number.isFinite(usdEgp) && usdEgp > 0 ? (xauUsd / 31.1034768) * usdEgp : null;
  const varianceLive =
    fair24Live && Number.isFinite(fair24Live) && fair24Live > 0 && liveLocal24 && Number.isFinite(liveLocal24) && liveLocal24 > 0
      ? (liveLocal24 - fair24Live) / fair24Live
      : null;

  const telegram = await sendTelegramSignalToEnabledUsers({
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

  return { ok: true as const, cron, telegram };
}

async function runNotifyCronViaFetch(): Promise<{ ok: boolean; status: number; body: any }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, body: { error: 'CRON_SECRET not configured' } };
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const res = await fetch(`${base}/api/cron/notify`, {
    method: 'GET',
    headers: {
      'x-cron-secret': secret,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: json };
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => null)) as { key?: 'gold_signals' | 'notify_rules' } | null;
    const key = body?.key;

    if (key !== 'gold_signals' && key !== 'notify_rules') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid key' }, { status: 400 }));
    }

    const supabase = getServerClient();

    if (key === 'gold_signals') {
      const r = await runGoldSignalsWithTelegram(supabase);
      return withNoStoreHeaders(NextResponse.json({ ok: r.ok, result: r }, { status: r.ok ? 200 : 500 }));
    }

    const notify = await runNotifyCronViaFetch();
    return withNoStoreHeaders(
      NextResponse.json({ ok: notify.ok, status: notify.status, result: notify.body }, { status: notify.ok ? 200 : 502 })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
