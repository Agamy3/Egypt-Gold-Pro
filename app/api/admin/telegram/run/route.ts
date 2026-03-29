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

type RunKey = 'gold_signals' | 'notify_rules';

type RunResult = {
  ok: boolean;
  automation: RunKey;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  message: string;
  error?: string;
  detail?: unknown;
};

async function runGoldSignalsWithTelegram(supabase: ReturnType<typeof getServerClient>): Promise<RunResult> {
  const cron = await runGoldSignalsCron({ supabase, now: new Date() });
  if (!cron.ok) {
    return {
      ok: false,
      automation: 'gold_signals',
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      message: 'Gold signals cron failed',
      error: cron.error,
      detail: cron,
    };
  }

  const canSend = await isTelegramAutomationEnabled(supabase, 'gold_signals').catch(() => true);
  if (!canSend) {
    return {
      ok: true,
      automation: 'gold_signals',
      attempted: 0,
      sent: 0,
      skipped: 1,
      failed: 0,
      message: 'Telegram gold signals automation is disabled',
      detail: { cron },
    };
  }

  // IMPORTANT: runGoldSignalsCron can return createdCount=0 if the cycle already exists.
  // For manual admin runs we still want to attempt sending the *latest* EG final_action.
  const { data: latestEg } = await supabase
    .from('gold_signals')
    .select('cycle_key, xau_usd, final_action, final_confidence0to1, variance_pct, cycle_started_at, meta')
    .eq('country', 'EG')
    .order('cycle_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const finalAction = latestEg ? String((latestEg as any).final_action ?? '').toUpperCase() : '';
  if (finalAction !== 'BUY' && finalAction !== 'SELL') {
    return {
      ok: true,
      automation: 'gold_signals',
      attempted: 0,
      sent: 0,
      skipped: 1,
      failed: 0,
      message: `No BUY/SELL signal to send (final_action=${finalAction || 'missing'})`,
      detail: { cron, latestEg },
    };
  }

  const xauUsd = latestEg ? Number((latestEg as any).xau_usd) : NaN;
  const conf = latestEg ? Number((latestEg as any).final_confidence0to1 ?? null) : null;
  const meta = (latestEg as any)?.meta || {};

  if (!isFinite(xauUsd) || xauUsd <= 0) {
    return {
      ok: true,
      automation: 'gold_signals',
      attempted: 0,
      sent: 0,
      skipped: 1,
      failed: 0,
      message: 'Missing XAUUSD price on latest EG signal',
      detail: { cron, latestEg },
    };
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
    action: finalAction as 'BUY' | 'SELL',
    xauUsd,
    confidence: isFinite(conf as number) ? (conf as number) : null,
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

  const attempted = (telegram.sent ?? 0) + (telegram.failed ?? 0);
  const skipped = attempted === 0 ? 1 : 0;
  const msg =
    attempted === 0
      ? 'No eligible users to send to (or all sends skipped by per-user rules)'
      : telegram.failed > 0
        ? `Telegram sent with failures (sent=${telegram.sent}, failed=${telegram.failed})`
        : `Telegram sent (sent=${telegram.sent})`;

  return {
    ok: true,
    automation: 'gold_signals',
    attempted,
    sent: telegram.sent,
    skipped,
    failed: telegram.failed,
    message: msg,
    detail: { cron, latestEg, telegram },
  };
}

async function runNotifyCronViaFetch(origin: string): Promise<{ ok: boolean; status: number; body: any }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, body: { error: 'CRON_SECRET not configured' } };
  }

  const base = origin.replace(/\/$/, '');
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
    const body = (await req.json().catch(() => null)) as { key?: RunKey } | null;
    const key = body?.key;

    if (key !== 'gold_signals' && key !== 'notify_rules') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid key' }, { status: 400 }));
    }

    const supabase = getServerClient();

    if (key === 'gold_signals') {
      const r = await runGoldSignalsWithTelegram(supabase);
      return withNoStoreHeaders(NextResponse.json(r, { status: r.ok ? 200 : 500 }));
    }

    const startedAtIso = new Date().toISOString();
    const origin = req.nextUrl?.origin || new URL(req.url).origin;
    const notify = await runNotifyCronViaFetch(origin);
    if (!notify.ok) {
      const r: RunResult = {
        ok: false,
        automation: 'notify_rules',
        attempted: 1,
        sent: 0,
        skipped: 0,
        failed: 1,
        message: 'Notify cron failed',
        error:
          notify.body && (notify.body.error || notify.body.details)
            ? String(notify.body.error || notify.body.details)
            : `HTTP ${notify.status}`,
        detail: notify.body,
      };
      return withNoStoreHeaders(NextResponse.json(r, { status: 502 }));
    }

    const { data: rows } = await supabase
      .from('notification_deliveries_log')
      .select('status')
      .eq('channel', 'telegram')
      .eq('payload->>source', 'notify_rules')
      .gte('created_at', startedAtIso)
      .limit(5000);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of (rows ?? []) as Array<{ status?: unknown }>) {
      const s = String(r.status || '');
      if (s === 'sent') sent += 1;
      else if (s === 'failed') failed += 1;
      else if (s === 'skipped') skipped += 1;
    }
    const attempted = sent + failed + skipped;
    const message =
      attempted === 0
        ? 'Notify cron executed but no Telegram deliveries were produced (no eligible alerts/users or all channels disabled)'
        : failed > 0
          ? `Notify cron executed with Telegram failures (sent=${sent}, failed=${failed}, skipped=${skipped})`
          : `Notify cron executed (sent=${sent}, skipped=${skipped})`;

    const r: RunResult = {
      ok: true,
      automation: 'notify_rules',
      attempted,
      sent,
      skipped,
      failed,
      message,
      detail: notify.body,
    };

    return withNoStoreHeaders(NextResponse.json(r, { status: 200 }));
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
