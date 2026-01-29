import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { fetchQuote, fetchQuoteForProvider } from '@/lib/priceFeed';
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
  return provider === 'gold_api_free' ? 'gold_api_free_xauusd' : 'goldapi_xauusd';
}

function nowIso() {
  return new Date().toISOString();
}

function providerFromSource(source: string | null | undefined): 'goldapi' | 'gold_api_free' {
  const s = (source ?? '').toLowerCase();
  return s.startsWith('gold_api_free') ? 'gold_api_free' : 'goldapi';
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
    const missingTimestamp = Boolean(quote.missingTimestamp);

    // 1) Validate due predictions
    const now = new Date();
    const nowIsoStr = now.toISOString();
    const nowValidatedAtMs = now.getTime();

    const { data: due, error: dueErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('id, predicted_direction, p0, p0_at, due_at, meta, source, predicted_price, expected_low, expected_high')
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

    // Fetch one fresh quote per provider used by due predictions (plus current provider).
    const providersNeeded = new Set<'goldapi' | 'gold_api_free'>();
    providersNeeded.add(provider);
    for (const row of (due || []) as any[]) {
      providersNeeded.add(providerFromSource(row.source));
    }
    const quoteByProvider = new Map<'goldapi' | 'gold_api_free', { price: number; timestampMs: number }>();
    for (const p of providersNeeded) {
      try {
        const q = await fetchQuoteForProvider(p);
        quoteByProvider.set(p, { price: q.price, timestampMs: q.timestampMs });
      } catch {
        // If a provider quote fails, we'll skip rows that depend on it.
      }
    }

    for (const row of (due || []) as any[]) {
      const p0 = asNumber(row.p0);
      if (p0 === null) continue;
      const predicted = row.predicted_direction;
      const rowSource = String(row.source || '');
      const rowProvider = providerFromSource(rowSource);
      const q = quoteByProvider.get(rowProvider);
      if (!q) continue;
      const pValidation = q.price;
      const validationQuoteTimestampMs = q.timestampMs;

      const dueAtMs = Date.parse(String(row.due_at));
      const p0AtMs = Date.parse(String(row.p0_at));

      const mergedMeta = {
        ...(row.meta || {}),
        validationQuoteTimestampMs,
        validationPrice: predicted === 'STALE' ? null : pValidation,
        provider: rowProvider,
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

      // Numeric evaluation
      const predictedPrice = asNumber(row.predicted_price);
      const expectedLow = asNumber(row.expected_low);
      const expectedHigh = asNumber(row.expected_high);
      const priceError = predictedPrice == null ? null : Math.abs(p1 - predictedPrice);
      const rangeHit =
        expectedLow == null || expectedHigh == null ? null : p1 >= expectedLow && p1 <= expectedHigh;

      const { error: updErr } = await supabaseAdmin
        .from('admin_30s_predictions')
        .update({
          validated_at: nowIsoStr,
          p1,
          result,
          price_error: priceError,
          range_hit: rangeHit,
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

        const holdSeconds = isFinite(p0AtMs) ? (nowValidatedAtMs - p0AtMs) / 1000 : null;
        const exitSlippageMs = isFinite(dueAtMs) ? nowValidatedAtMs - dueAtMs : null;
        const tradeStatus =
          exitSlippageMs != null && Math.abs(exitSlippageMs) <= 7000 ? 'OK' : 'LATE';

        await supabaseAdmin.from('admin_30s_trades').insert({
          prediction_id: row.id,
          side,
          notional_usd: NOTIONAL_USD,
          qty_oz: qtyOz,
          entry_price: p0,
          exit_price: p1,
          pnl_usd: pnlUsd,
          closed_at: nowIsoStr,
          due_at: row.due_at,
          exit_slippage_ms: exitSlippageMs,
          hold_seconds: holdSeconds,
          trade_status: tradeStatus,
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
    let predicted_delta: number | null = null;
    let predicted_price: number | null = null;
    let confidence: number | null = null;
    let expected_low: number | null = null;
    let expected_high: number | null = null;

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
        p0,
        p30sAgoPrice: p30sAgo,
        p30sAgoAtMs,
        recentPrices,
        nowTsMs: nowMs,
        quoteTimestampMs,
        provider,
        referenceMissing,
        missingTimestamp,
        absoluteMin: 0.1,
        k: 0.8,
      });

      predicted_direction = h.direction;
      predicted_delta = h.predicted_delta;
      predicted_price = h.predicted_price;
      confidence = h.confidence;
      expected_low = h.expected_low;
      expected_high = h.expected_high;
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
        predicted_delta,
        predicted_price,
        confidence,
        expected_low,
        expected_high,
      })
      .select('id, p0_at, due_at, predicted_direction, p0, source, meta, predicted_delta, predicted_price, confidence, expected_low, expected_high')
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

