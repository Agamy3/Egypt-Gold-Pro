import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { fetchGoldApiQuote } from '@/lib/priceFeed/goldapi';
import { getPriceAroundSecondsAgo, getRecentPricesForVolatility } from '@/lib/priceFeed/history';
import { decideDirection } from '@/lib/forecast/thirtySecondHeuristic';
import { dynamic, revalidate, withNoStoreHeaders } from '../_util';

export { dynamic, revalidate };

type PredRow = {
  id: string;
  predicted_direction: 'UP' | 'DOWN' | 'STALE';
  p0: number;
  p0_at: string;
  due_at: string;
  meta?: any;
};

const HORIZON_SECONDS = 30;
const STALE_AFTER_SECONDS = 120;
const NOTIONAL_USD = 10;
const SOURCE = 'goldapi_xauusd';

function asNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST() {
  try {
    await requireAdmin();

    const supabaseAdmin = getServerClient();

    // Fetch current quote from GoldAPI (external, real-time).
    let quote;
    try {
      quote = await fetchGoldApiQuote();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: msg }, { status: 502 }));
    }

    const nowMs = Date.now();
    const quoteTimestampMs = quote.timestamp;
    const staleAgeSec = Math.max(0, (nowMs - quoteTimestampMs) / 1000);
    const isStale = staleAgeSec > STALE_AFTER_SECONDS;
    const pLatest = quote.price;

    // 1) Validate due predictions
    const now = new Date();
    const nowIsoStr = now.toISOString();

    const { data: due, error: dueErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('id, predicted_direction, p0, p0_at, due_at, meta')
      .eq('source', SOURCE)
      .is('validated_at', null)
      .lte('due_at', nowIsoStr)
      .order('due_at', { ascending: true })
      .limit(50);

    if (dueErr) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: dueErr.message }, { status: 500 })
      );
    }

    let validatedCount = 0;
    const eps = 1e-9;

    // Prefer a fresh fetch per validation batch (not per-row).
    let validationQuote = quote;
    try {
      validationQuote = await fetchGoldApiQuote();
    } catch {
      // keep initial quote
    }
    const pValidation = validationQuote.price;
    const validationQuoteTimestampMs = validationQuote.timestamp;

    for (const row of (due || []) as unknown as PredRow[]) {
      const p0 = asNumber(row.p0);
      if (p0 === null) continue;
      const p1 = pValidation;

      let result: 'TRUE' | 'FALSE' | 'TIE' | 'NA' = 'NA';
      if (row.predicted_direction === 'STALE') {
        result = 'NA';
      } else if (Math.abs(p1 - p0) <= eps) {
        result = 'TIE';
      } else if (row.predicted_direction === 'UP') {
        result = p1 > p0 ? 'TRUE' : 'FALSE';
      } else if (row.predicted_direction === 'DOWN') {
        result = p1 < p0 ? 'TRUE' : 'FALSE';
      }

      const mergedMeta = {
        ...(row.meta || {}),
        validationQuoteTimestampMs,
        validationPrice: p1,
      };

      const { error: updErr } = await supabaseAdmin
        .from('admin_30s_predictions')
        .update({
          validated_at: nowIsoStr,
          p1,
          result,
          meta: mergedMeta,
        })
        .eq('id', row.id);

      if (updErr) continue;
      validatedCount += 1;

      // Trades: only if predicted UP/DOWN (judged trade); STALE => no trade.
      if (row.predicted_direction === 'UP' || row.predicted_direction === 'DOWN') {
        const side: 'LONG' | 'SHORT' = row.predicted_direction === 'UP' ? 'LONG' : 'SHORT';
        const qtyOz = NOTIONAL_USD / p0;
        const pnlUsd = side === 'LONG' ? qtyOz * (p1 - p0) : qtyOz * (p0 - p1);

        await supabaseAdmin.from('admin_30s_trades').insert({
          prediction_id: row.id,
          side,
          notional_usd: NOTIONAL_USD,
          qty_oz: qtyOz,
          entry_price: p0,
          exit_price: p1,
          pnl_usd: pnlUsd,
          closed_at: nowIsoStr,
        });
      }
    }

    // 2) Create new prediction
    const t0 = new Date();
    const p0 = pLatest;
    const p0At = t0.toISOString();
    const dueAt = new Date(t0.getTime() + HORIZON_SECONDS * 1000).toISOString();

    let predicted_direction: 'UP' | 'DOWN' | 'STALE' = 'STALE';
    let meta: Record<string, unknown> = {};

    if (isStale) {
      predicted_direction = 'STALE';
      meta = {
        reason: 'stale_data',
        staleAfterSeconds: STALE_AFTER_SECONDS,
        quoteTimestampMs,
        staleAgeSec,
      };
    } else {
      // p30sAgo from DB (prediction history) as proxy history (serverless-safe).
      const refRes = await getPriceAroundSecondsAgo(supabaseAdmin, HORIZON_SECONDS, { source: SOURCE });
      const recentRes = await getRecentPricesForVolatility(supabaseAdmin, {
        secondsBack: 120,
        limit: 200,
        source: SOURCE,
      });

      const recentPrices = recentRes.ok ? recentRes.prices : [];

      // Fallback ref: oldest recent price if no explicit 30s-ago record.
      let p30sAgo = p0;
      let p30sAgoAtMs = nowMs;
      let referenceMissing = false;

      if (refRes.ok) {
        p30sAgo = refRes.price;
        p30sAgoAtMs = Date.parse(refRes.atIso);
      } else if (recentRes.ok && recentRes.points.length > 0) {
        p30sAgo = recentRes.points[0].v;
        p30sAgoAtMs = recentRes.points[0].t;
        referenceMissing = true;
      } else {
        referenceMissing = true;
      }

      const h = decideDirection({
        isStale,
        pNow: p0,
        p30sAgo,
        p30sAgoAtMs,
        recentPrices,
        nowTsMs: nowMs,
        quoteTimestampMs,
        absoluteMin: 0.1,
        k: 1.5,
      });

      predicted_direction = h.direction;
      meta = {
        ...h.meta,
        referenceMissing,
        p30sAgo,
        p30sAgoAtMs,
        bid: quote.bid ?? null,
        ask: quote.ask ?? null,
        baseUrl: (process.env.GOLDAPI_BASE_URL ?? 'https://app.goldapi.net').toString(),
        recentFetchError: recentRes.ok ? null : recentRes.error,
        refFetchError: refRes.ok ? null : refRes.error,
      };
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .insert({
        horizon_seconds: HORIZON_SECONDS,
        predicted_direction,
        p0,
        p0_at: p0At,
        due_at: dueAt,
        source: SOURCE,
        meta,
      })
      .select('id, p0_at, due_at, predicted_direction, p0, source, meta')
      .single();

    if (insErr) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
      );
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        createdPrediction: created,
        validated: { count: validatedCount },
        latest: { price: pLatest, quoteTimestampMs, isStale },
        serverAsOf: nowIso(),
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

