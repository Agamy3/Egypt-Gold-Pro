import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchQuoteForProvider, getPriceFeedProvider } from '@/lib/priceFeed';
import { getLatestPriceAtOrBeforeTime, getRecentPricesForVolatility } from '@/lib/priceFeed/history';
import { decideDirection } from '@/lib/forecast/thirtySecondHeuristic';
import { floorToUtcMinute, nextUtcMinuteBoundary, toMinuteKeyUtc } from '@/lib/time/minuteBoundary';

const STALE_AFTER_MS = 120_000;
const HORIZON_SECONDS = 60;
const VOL_WINDOW_SECONDS = 300; // 5 minutes
const NOTIONAL_USD = 10;

function asNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function providerFromSource(source: string | null | undefined): 'goldapi' | 'gold_api_free' {
  const s = (source ?? '').toLowerCase();
  return s.startsWith('gold_api_free') ? 'gold_api_free' : 'goldapi';
}

export function sourceForProvider(provider: 'goldapi' | 'gold_api_free') {
  return provider === 'gold_api_free' ? 'gold_api_free_xauusd' : 'goldapi_xauusd';
}

export type MinuteBotRunResult = {
  ok: true;
  serverAsOf: string;
  validatedCount: number;
  created: boolean;
  createdPrediction?: any;
  forecastUpserted?: boolean;
  forecastRow?: any;
  tradingEnabled?: boolean;
  forecastValidated?: boolean;
  validatedForecastMinuteKey?: string | null;
  provider: 'goldapi' | 'gold_api_free';
  source: string;
  alignedTo: string;
  createdMinuteKey: string | null;
} | { ok: false; error: string; status?: number };

async function getTradingEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from('bot_settings').select('value').eq('key', 'minute_bot').maybeSingle();
  if (error) return true; // fail-open if settings table missing/misconfigured
  const v = (data as any)?.value as any;
  return v?.tradingEnabled !== false;
}

function computeDirectionFromPrediction(input: {
  predicted_direction: 'UP' | 'DOWN' | 'STALE';
  p0: number | null;
  predicted_price: number | null;
}): 'UP' | 'DOWN' | 'TIE' | 'STALE' | 'NA' {
  if (input.predicted_direction === 'STALE') return 'STALE';
  const p0 = input.p0;
  const pp = input.predicted_price;
  if (p0 == null || !isFinite(p0) || p0 <= 0 || pp == null || !isFinite(pp)) return 'NA';
  const eps = 1e-9;
  if (Math.abs(pp - p0) <= eps) return 'TIE';
  return pp > p0 ? 'UP' : 'DOWN';
}

function computeOutcome(input: { direction: 'UP' | 'DOWN' | 'TIE' | 'STALE' | 'NA'; p0: number | null; p1: number | null }) {
  const { direction, p0, p1 } = input;
  if (direction === 'STALE') return 'stale' as const;
  if (direction === 'NA') return 'na' as const;
  if (p0 == null || !isFinite(p0) || p0 <= 0 || p1 == null || !isFinite(p1)) return 'na' as const;
  const eps = 1e-9;
  if (Math.abs(p1 - p0) <= eps) return 'tie' as const;
  if (direction === 'TIE') return 'false' as const;
  if (direction === 'UP') return p1 > p0 ? ('true' as const) : ('false' as const);
  if (direction === 'DOWN') return p1 < p0 ? ('true' as const) : ('false' as const);
  return 'na' as const;
}

/**
 * Runs:
 * 1) validate due predictions
 * 2) create exactly one prediction for the current minute boundary (idempotent)
 *
 * Designed to be called from cron and admin "run-now".
 */
export async function runMinuteForecastBot(input: {
  supabase: SupabaseClient;
  now?: Date;
  create?: boolean;
}): Promise<MinuteBotRunResult> {
  const supabase = input.supabase;
  const now = input.now ?? new Date();
  const shouldCreate = input.create !== false;
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  // Minute boundary info (shared across forecast + prediction)
  const provider = getPriceFeedProvider();
  const source = sourceForProvider(provider);
  const t0 = floorToUtcMinute(now);
  const t0Iso = t0.toISOString();
  const minuteKey = toMinuteKeyUtc(t0);
  const dueAtIso = nextUtcMinuteBoundary(t0).toISOString();

  const tradingEnabled = await getTradingEnabled(supabase);

  // ============================
  // Step 1) Validate previous minute forecast (independent of trades)
  // ============================
  let forecastValidated = false;
  let validatedForecastMinuteKey: string | null = null;
  try {
    const prevMinuteKey = toMinuteKeyUtc(new Date(t0.getTime() - 60_000));
    validatedForecastMinuteKey = prevMinuteKey;

    const { data: prevForecast, error: prevErr } = await supabase
      .from('minute_forecasts')
      .select('id, minute_key, p0, direction, validated_at, meta')
      .eq('minute_key', prevMinuteKey)
      .eq('country', 'GLOBAL')
      .eq('karat', 24)
      .maybeSingle();

    if (!prevErr && prevForecast && !(prevForecast as any).validated_at) {
      const q = await fetchQuoteForProvider(provider);
      const p1 = q.price;
      const p0 = asNumber((prevForecast as any).p0);
      const dir = String((prevForecast as any).direction || 'NA') as any;
      const outcome = computeOutcome({ direction: dir, p0, p1 });

      const mergedMeta = {
        ...((prevForecast as any).meta || {}),
        validationQuoteTimestampMs: q.timestampMs,
        validationProvider: q.provider,
      };

      const { error: updErr } = await supabase
        .from('minute_forecasts')
        .update({
          validated_at: nowIso,
          p1,
          outcome,
          updated_at: nowIso,
          meta: mergedMeta,
        })
        .eq('id', (prevForecast as any).id);

      if (!updErr) forecastValidated = true;
    }
  } catch {
    // best-effort; don't block forecast creation
  }

  // ============================
  // Forecast stream (decoupled)
  // Always upsert a forecast row for this minute_key, independent of trade validation.
  // ============================
  let forecastUpserted = false;
  let forecastRow: any = null;

  if (shouldCreate) {
    // If the forecast already exists for this minute, do not block; just skip upsert.
    const { data: existingForecast } = await supabase
      .from('minute_forecasts')
      .select('id')
      .eq('minute_key', minuteKey)
      .eq('country', 'GLOBAL')
      .eq('karat', 24)
      .maybeSingle();

    if (!existingForecast?.id) {
      // Entry quote + heuristic (same logic as prediction creation below)
      let entryQuote;
      try {
        entryQuote = await fetchQuoteForProvider(provider);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg, status: 502 };
      }

      const p0 = entryQuote.price;
      const quoteTimestampMs = entryQuote.timestampMs;
      const missingTimestamp = Boolean(entryQuote.missingTimestamp);
      const isStale = !missingTimestamp && nowMs - quoteTimestampMs > STALE_AFTER_MS;
      const staleAgeSec = Math.max(0, (nowMs - quoteTimestampMs) / 1000);

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
          staleAfterMs: STALE_AFTER_MS,
          quoteTimestampMs,
          staleAgeSec,
          provider,
          missingTimestamp,
          minuteBoundaryIso: t0Iso,
        };
      } else {
        const recentRes = await getRecentPricesForVolatility(supabase, {
          secondsBack: VOL_WINDOW_SECONDS,
          limit: 300,
          source,
        });
        const recentPrices = recentRes.ok ? recentRes.prices : [];

        const targetMs = t0.getTime() - HORIZON_SECONDS * 1000;
        const refRes = await getLatestPriceAtOrBeforeTime(supabase, targetMs, { source });

        let pAgo = p0;
        let pAgoAtMs = nowMs;
        let referenceMissing = false;
        if (refRes.ok) {
          pAgo = refRes.price;
          pAgoAtMs = refRes.atMs;
        } else if (recentRes.ok && recentRes.points.length > 0) {
          pAgo = recentRes.points[0].v;
          pAgoAtMs = recentRes.points[0].t;
          referenceMissing = true;
        } else {
          referenceMissing = true;
        }

        const h = decideDirection({
          isStale,
          p0,
          p30sAgoPrice: pAgo,
          p30sAgoAtMs: pAgoAtMs,
          recentPrices,
          nowTsMs: nowMs,
          quoteTimestampMs,
          provider,
          referenceMissing,
          missingTimestamp,
          absoluteMin: 0.1,
          k: 0.8,
          windowSeconds: VOL_WINDOW_SECONDS,
        });

        predicted_direction = h.direction;
        predicted_delta = h.predicted_delta;
        predicted_price = h.predicted_price;
        confidence = h.confidence;
        expected_low = h.expected_low;
        expected_high = h.expected_high;
        meta = {
          ...h.meta,
          quoteTimestampMs,
          staleAgeSec,
          provider,
          missingTimestamp,
          minuteBoundaryIso: t0Iso,
          horizonSeconds: HORIZON_SECONDS,
          refTargetMs: targetMs,
          refError: refRes.ok ? null : refRes.error,
          recentError: recentRes.ok ? null : recentRes.error,
          predicted_delta,
          expected_low,
          expected_high,
        };
      }

      const direction = computeDirectionFromPrediction({
        predicted_direction,
        p0,
        predicted_price,
      });

      const forecastInsert = {
        minute_key: minuteKey,
        country: 'GLOBAL',
        scope: 'global',
        karat: 24,
        p0,
        predicted_price,
        direction,
        confidence,
        provider,
        source,
        meta,
        updated_at: nowIso,
      };

      const { data: fcRows, error: fcErr } = await supabase
        .from('minute_forecasts')
        .upsert(forecastInsert, {
          onConflict: 'minute_key,country,karat',
          ignoreDuplicates: false,
        })
        .select('*');

      if (fcErr) return { ok: false, error: fcErr.message, status: 500 };
      forecastUpserted = true;
      forecastRow = Array.isArray(fcRows) && fcRows.length > 0 ? fcRows[0] : null;
    }
  }

  // Validate all due predictions across all sources (trades are derived here).
  // This is intentionally independent from the forecast stream above.
  const { data: due, error: dueErr } = await supabase
    .from('admin_30s_predictions')
    .select('id, predicted_direction, p0, p0_at, due_at, meta, source, predicted_price, expected_low, expected_high')
    .is('validated_at', null)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(200);

  if (dueErr) return { ok: false, error: dueErr.message, status: 500 };

  // Collect providers needed for validation
  const providersNeeded = new Set<'goldapi' | 'gold_api_free'>();
  for (const row of (due || []) as any[]) {
    providersNeeded.add(providerFromSource(String(row.source || '')));
  }

  const quoteByProvider = new Map<'goldapi' | 'gold_api_free', { price: number; timestampMs: number; missingTimestamp: boolean }>();
  for (const p of providersNeeded) {
    try {
      const q = await fetchQuoteForProvider(p);
      quoteByProvider.set(p, { price: q.price, timestampMs: q.timestampMs, missingTimestamp: Boolean(q.missingTimestamp) });
    } catch {
      // skip; rows needing this provider will be ignored this cycle
    }
  }

  let validatedCount = 0;
  const eps = 1e-9;

  for (const row of (due || []) as any[]) {
    const predicted = row.predicted_direction as 'UP' | 'DOWN' | 'STALE';
    const p0 = asNumber(row.p0);
    if (p0 == null) continue;

    const rowProvider = providerFromSource(String(row.source || ''));
    const q = quoteByProvider.get(rowProvider);
    if (!q) continue;

    const dueAtMs = Date.parse(String(row.due_at));
    const p0AtMs = Date.parse(String(row.p0_at));

    const mergedMeta = {
      ...(row.meta || {}),
      validationQuoteTimestampMs: q.timestampMs,
      validationPrice: predicted === 'STALE' ? null : q.price,
      provider: rowProvider,
    };

    // STALE => NA, validated, keep p1 null, no trade
    if (predicted === 'STALE') {
      const { error: updErr } = await supabase
        .from('admin_30s_predictions')
        .update({ validated_at: nowIso, p1: null, result: 'NA', meta: mergedMeta })
        .eq('id', row.id);
      if (!updErr) validatedCount += 1;
      continue;
    }

    const p1 = q.price;
    let result: 'TRUE' | 'FALSE' | 'TIE' | 'NA' = 'NA';
    if (Math.abs(p1 - p0) <= eps) result = 'TIE';
    else if (predicted === 'UP') result = p1 > p0 ? 'TRUE' : 'FALSE';
    else if (predicted === 'DOWN') result = p1 < p0 ? 'TRUE' : 'FALSE';

    const predictedPrice = asNumber(row.predicted_price);
    const expectedLow = asNumber(row.expected_low);
    const expectedHigh = asNumber(row.expected_high);
    const priceError = predictedPrice == null ? null : Math.abs(p1 - predictedPrice);
    const rangeHit = expectedLow == null || expectedHigh == null ? null : p1 >= expectedLow && p1 <= expectedHigh;

    const { error: updErr } = await supabase
      .from('admin_30s_predictions')
      .update({
        validated_at: nowIso,
        p1,
        result,
        price_error: priceError,
        range_hit: rangeHit,
        meta: mergedMeta,
      })
      .eq('id', row.id);

    if (updErr) continue;
    validatedCount += 1;

    // Trade record (UP/DOWN only)
    const side: 'LONG' | 'SHORT' = predicted === 'UP' ? 'LONG' : 'SHORT';
    const qtyOz = NOTIONAL_USD / p0;
    const pnlUsd = side === 'LONG' ? qtyOz * (p1 - p0) : qtyOz * (p0 - p1);

    const holdSeconds = isFinite(p0AtMs) ? (nowMs - p0AtMs) / 1000 : null;
    const exitSlippageMs = isFinite(dueAtMs) ? nowMs - dueAtMs : null;
    const tradeStatus = exitSlippageMs != null && Math.abs(exitSlippageMs) <= 7000 ? 'OK' : 'LATE';

    await supabase.from('admin_30s_trades').insert({
      prediction_id: row.id,
      side,
      notional_usd: NOTIONAL_USD,
      qty_oz: qtyOz,
      entry_price: p0,
      exit_price: p1,
      pnl_usd: pnlUsd,
      closed_at: nowIso,
      due_at: row.due_at,
      exit_slippage_ms: exitSlippageMs,
      hold_seconds: holdSeconds,
      trade_status: tradeStatus,
    });
  }

  if (!shouldCreate || !tradingEnabled) {
    return {
      ok: true,
      serverAsOf: nowIso,
      validatedCount,
      created: false,
      forecastUpserted,
      forecastRow: forecastRow ?? undefined,
      tradingEnabled,
      forecastValidated,
      validatedForecastMinuteKey,
      provider,
      source,
      alignedTo: t0Iso,
      createdMinuteKey: null,
    };
  }

  // Minute-based idempotency only: if this minute's record already exists, skip creation.
  // IMPORTANT: Do not gate on any "open"/unvalidated predictions/trades from other minutes.
  const { data: existingMinute } = await supabase
    .from('admin_30s_predictions')
    .select('id')
    .eq('minute_key', minuteKey)
    .eq('source', source)
    .eq('horizon_seconds', HORIZON_SECONDS)
    .maybeSingle();

  if (existingMinute?.id) {
    return {
      ok: true,
      serverAsOf: nowIso,
      validatedCount,
      created: false,
      forecastUpserted,
      forecastRow: forecastRow ?? undefined,
      tradingEnabled,
      forecastValidated,
      validatedForecastMinuteKey,
      provider,
      source,
      alignedTo: t0Iso,
      createdMinuteKey: minuteKey,
    };
  }

  // Entry quote
  let entryQuote;
  try {
    entryQuote = await fetchQuoteForProvider(provider);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, status: 502 };
  }

  const p0 = entryQuote.price;
  const quoteTimestampMs = entryQuote.timestampMs;
  const missingTimestamp = Boolean(entryQuote.missingTimestamp);
  const isStale = !missingTimestamp && nowMs - quoteTimestampMs > STALE_AFTER_MS;
  const staleAgeSec = Math.max(0, (nowMs - quoteTimestampMs) / 1000);

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
      staleAfterMs: STALE_AFTER_MS,
      quoteTimestampMs,
      staleAgeSec,
      provider,
      missingTimestamp,
      minuteBoundaryIso: t0Iso,
    };
  } else {
    // Volatility window (5 minutes)
    const recentRes = await getRecentPricesForVolatility(supabase, {
      secondsBack: VOL_WINDOW_SECONDS,
      limit: 300,
      source,
    });
    const recentPrices = recentRes.ok ? recentRes.prices : [];

    // Reference price: most recent <= t0 - 60s (strict)
    const targetMs = t0.getTime() - HORIZON_SECONDS * 1000;
    const refRes = await getLatestPriceAtOrBeforeTime(supabase, targetMs, { source });

    let pAgo = p0;
    let pAgoAtMs = nowMs;
    let referenceMissing = false;
    if (refRes.ok) {
      pAgo = refRes.price;
      pAgoAtMs = refRes.atMs;
    } else if (recentRes.ok && recentRes.points.length > 0) {
      pAgo = recentRes.points[0].v;
      pAgoAtMs = recentRes.points[0].t;
      referenceMissing = true;
    } else {
      referenceMissing = true;
    }

    const h = decideDirection({
      isStale,
      p0,
      p30sAgoPrice: pAgo,
      p30sAgoAtMs: pAgoAtMs,
      recentPrices,
      nowTsMs: nowMs,
      quoteTimestampMs,
      provider,
      referenceMissing,
      missingTimestamp,
      absoluteMin: 0.1,
      k: 0.8,
      windowSeconds: VOL_WINDOW_SECONDS,
    });

    predicted_direction = h.direction;
    predicted_delta = h.predicted_delta;
    predicted_price = h.predicted_price;
    confidence = h.confidence;
    expected_low = h.expected_low;
    expected_high = h.expected_high;
    meta = {
      ...h.meta,
      quoteTimestampMs,
      staleAgeSec,
      provider,
      missingTimestamp,
      minuteBoundaryIso: t0Iso,
      horizonSeconds: HORIZON_SECONDS,
      refTargetMs: targetMs,
      refError: refRes.ok ? null : refRes.error,
      recentError: recentRes.ok ? null : recentRes.error,
    };
  }

  // DB-level idempotency: upsert with conflict on (minute_key, source, horizon_seconds) and DO NOTHING.
  const insertRow = {
    minute_key: minuteKey,
    horizon_seconds: HORIZON_SECONDS,
    predicted_direction,
    p0,
    p0_at: t0Iso,
    due_at: dueAtIso,
    source,
    meta,
    predicted_delta,
    predicted_price,
    confidence,
    expected_low,
    expected_high,
  };

  const { data: createdRows, error: insErr } = await supabase
    .from('admin_30s_predictions')
    .upsert(insertRow, {
      onConflict: 'minute_key,source,horizon_seconds',
      ignoreDuplicates: true,
    })
    .select('*');

  if (insErr) return { ok: false, error: insErr.message, status: 500 };

  const created = Array.isArray(createdRows) && createdRows.length > 0 ? createdRows[0] : null;

  return {
    ok: true,
    serverAsOf: nowIso,
    validatedCount,
    created: Boolean(created),
    createdPrediction: created ?? undefined,
    forecastUpserted,
    forecastRow: forecastRow ?? undefined,
    tradingEnabled,
    forecastValidated,
    validatedForecastMinuteKey,
    provider,
    source,
    alignedTo: t0Iso,
    createdMinuteKey: minuteKey,
  };
}

