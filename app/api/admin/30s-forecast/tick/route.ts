import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { fetchQuote } from '@/lib/priceFeed';
import { getNearestPriceAroundTime, getRecentPricesForVolatility } from '@/lib/priceFeed/history';
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

function asNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function sourceForProvider(provider: 'goldapi' | 'gold_api_free') {
  return provider === 'gold_api_free' ? 'gold_api_free_xau' : 'goldapi_xauusd';
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST() {
  try {
    await requireAdmin();

    const supabaseAdmin = getServerClient();

    // Fetch current quote from configured provider (external, real-time).
    let quote;
    try {
      quote = await fetchQuote();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: msg }, { status: 502 }));
    }

    const nowMs = Date.now();
    const quoteTimestampMs = quote.timestampMs;
    const staleAgeSec = Math.max(0, (nowMs - quoteTimestampMs) / 1000);
    const isStale = staleAgeSec > STALE_AFTER_SECONDS;
    const pLatest = quote.price;
    const provider = quote.provider;
    const source = sourceForProvider(provider);
    const missingTimestamp = Boolean((quote.raw as any)?.missingTimestamp);

    // 1) Validate due predictions
    const now = new Date();
    const nowIsoStr = now.toISOString();

    const { data: due, error: dueErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('id, predicted_direction, p0, p0_at, due_at, meta')
      .eq('source', source)
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
      validationQuote = await fetchQuote();
    } catch {
      // keep initial quote
    }
    const pValidation = validationQuote.price;
    const validationQuoteTimestampMs = validationQuote.timestampMs;

    for (const row of (due || []) as unknown as PredRow[]) {
      const p0 = asNumber(row.p0);
      if (p0 === null) continue;
      const predicted = row.predicted_direction;

      const mergedMeta = {
        ...(row.meta || {}),
        validationQuoteTimestampMs,
        validationPrice: predicted === 'STALE' ? null : pValidation,
        provider,
      };

      // STALE => NA, set validated_at, keep p1 null (cleaner).
      if (predicted === 'STALE') {
        const { error: updErr } = await supabaseAdmin
          .from('admin_30s_predictions')
          .update({
            validated_at: nowIsoStr,
            p1: null,
            result: 'NA',
            meta: mergedMeta,
          })
          .eq('id', row.id);

        if (!updErr) validatedCount += 1;
        continue;
      }

      const p1 = pValidation;
      let result: 'TRUE' | 'FALSE' | 'TIE' | 'NA' = 'NA';
      if (Math.abs(p1 - p0) <= eps) result = 'TIE';
      else if (predicted === 'UP') result = p1 > p0 ? 'TRUE' : 'FALSE';
      else if (predicted === 'DOWN') result = p1 < p0 ? 'TRUE' : 'FALSE';

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

      // Trades: only if predicted UP/DOWN
      if (predicted === 'UP' || predicted === 'DOWN') {
        const side: 'LONG' | 'SHORT' = predicted === 'UP' ? 'LONG' : 'SHORT';
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
        provider,
        missingTimestamp,
      };
    } else {
      const recentRes = await getRecentPricesForVolatility(supabaseAdmin, {
        secondsBack: 60,
        limit: 200,
        source,
      });

      const recentPrices = recentRes.ok ? recentRes.prices : [];

      const targetMs = nowMs - HORIZON_SECONDS * 1000;
      const refRes = await getNearestPriceAroundTime(supabaseAdmin, targetMs, { source, toleranceSeconds: 30 });

      // Fallback ref: oldest recent price if no explicit near-30s reference.
      let p30sAgo = p0;
      let p30sAgoAtMs = nowMs;
      let referenceMissing = false;

      if (refRes.ok) {
        p30sAgo = refRes.price;
        p30sAgoAtMs = refRes.atMs;
      } else if (recentRes.ok && recentRes.points.length > 0) {
        p30sAgo = recentRes.points[0].v;
        p30sAgoAtMs = recentRes.points[0].t;
        referenceMissing = true; // no real 30s reference, using oldest in window
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
        provider,
        referenceMissing,
        absoluteMin: 0.1,
        k: 0.8,
      });

      predicted_direction = h.direction;
      meta = {
        ...h.meta,
        referenceMissing,
        p30sAgo,
        p30sAgoAtMs,
        bid: quote.bid ?? null,
        ask: quote.ask ?? null,
        missingTimestamp,
        provider,
        quoteTimestampMs,
        staleAgeSec,
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
        source,
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
        latest: { price: pLatest, quoteTimestampMs, isStale, provider },
        serverAsOf: nowIso(),
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

