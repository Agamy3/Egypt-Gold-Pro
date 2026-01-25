/**
 * Forecast Series API
 * 
 * Returns time-series data for forecast chart
 * GET /api/forecast/series?minutes=120
 */

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getGoldSpotHistory } from '@/lib/supabase/goldSpot';
import { getCountryCurrency } from '@/lib/fx-multi';
import { fetchStooqHistoryDaily } from '@/lib/spot-fetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Bump this when changing behavior so production can be verified via curl.
const API_VERSION = '2026-01-15T21:24Z';
const PAGE_SIZE = 1000;
const MAX_PAGES = 6; // hard cap for safety (<= 6000 rows scanned)

// Helper to get trusted mode from request
function getTrustedMode(request: Request): boolean {
  const url = new URL(request.url);
  const queryOverride = url.searchParams.get('trustedMode');
  if (queryOverride !== null) {
    return queryOverride === 'true';
  }
  
  const headerOverride = request.headers.get('x-trusted-mode');
  if (headerOverride !== null) {
    return headerOverride === 'true';
  }
  
  return (
    process.env.EGYPT_TRUSTED_ONLY_MODE === 'true' ||
    process.env.NEXT_PUBLIC_EGYPT_TRUSTED_ONLY_MODE === 'true'
  );
}

const TRUSTED_EGYPT_SOURCE = 'goldbullioneg';

interface SeriesPoint {
  t: number; // timestamp
  ounceUsd: number | null; // Global ounce price (XAU/USD)
  market21Buy: number | null;
  fair21: number | null;
  variancePct: number | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minutesParam = searchParams.get('minutes');
    const rangeParam = searchParams.get('range') as 'daily' | 'weekly' | 'monthly' | 'yoy' | null;
    const scopeParam = searchParams.get('scope') as 'local' | 'global' | null;
    const countryParam = searchParams.get('country') as 'EG' | 'AE' | 'SA' | 'US' | null;
    
    // Default to EG if country not specified
    const country = (countryParam && ['EG', 'AE', 'SA', 'US'].includes(countryParam)) 
      ? countryParam 
      : 'EG';
    
    // Map range to minutes if provided
    // Match frontend TIME_RANGE_MAP values
    const rangeMap: Record<string, number> = {
      daily: 24 * 60,           // 24 hours = 1440 minutes
      weekly: 7 * 24 * 60,      // 7 days = 10080 minutes
      monthly: 30 * 24 * 60,    // 30 days = 43200 minutes
      yoy: 365 * 24 * 60,       // 1 year = 525600 minutes
    };
    
    // Priority: rangeParam > minutesParam > default (7 days)
    let minutes = 7 * 24 * 60; // default to 7 days
    if (rangeParam && rangeMap[rangeParam]) {
      minutes = rangeMap[rangeParam];
    } else if (minutesParam) {
      minutes = parseInt(minutesParam, 10);
    }
    
    // Clamp to reasonable bounds (10 minutes to 1 year)
    const windowMs = Math.min(Math.max(minutes, 10), 525600) * 60 * 1000;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    console.log('[Forecast Series] Window calculation:', { 
      rangeParam, 
      minutes, 
      windowMs: windowMs / (60 * 60 * 1000) + ' hours',
      windowStart: new Date(windowStart).toISOString(),
      now: new Date(now).toISOString()
    });

    // Get trusted mode from request
    const EGYPT_TRUSTED_ONLY_MODE = getTrustedMode(request);
    
    // Determine scope (default to local if not specified)
    const scope: 'local' | 'global' = scopeParam || 'local';

    // Get gold spot data for the entire window (for chart display)
    const goldSpotHistory = await getGoldSpotHistory(windowStart);

    // Create a map of timestamp -> ounce price for quick lookup
    const ouncePriceMap = new Map<number, number>();
    for (const spot of goldSpotHistory) {
      ouncePriceMap.set(spot.fetched_at, spot.xau_spot_usd_oz);
    }

    // Get latest spot for fair value calculation
    const latestSpot = goldSpotHistory.length > 0 
      ? goldSpotHistory[goldSpotHistory.length - 1]
      : null;

    // Get latest FX rate (for fair value calculation)
    // We'll need to fetch it fresh or use cached value
    let latestFx: number | null = null;
    try {
      const { getUsdEgpRate } = await import('@/lib/fx');
      const fxResult = await getUsdEgpRate();
      latestFx = fxResult.rate;
    } catch (error) {
      // FX unavailable, will skip fair value calculation
    }

    // Build series points based on scope
    let points: Array<{ t: number; v: number }> = [];
    let fallbackUsed = false;
    let fallbackSource: string | null = null;
    let lastDataAtMs: number | null = null;
    
    if (scope === 'global') {
      // Global scope: return global ounce price series
      const sortedSpotData = [...goldSpotHistory].sort((a, b) => a.fetched_at - b.fetched_at);
      
      for (const spot of sortedSpotData) {
        points.push({
          t: spot.fetched_at,
          v: spot.xau_spot_usd_oz,
        });
      }
    } else {
      // Local scope: return local market buy price series using normalized schema
      // Query market_snapshots_norm directly with country filter
      const supabase = getServerClient();
      let originalPointsCount = 0;
      
      if (!supabase) {
        console.error('[Forecast Series] Database client unavailable');
        points = [];
      } else {
        // Query normalized schema for country-specific data
        const createdAtIsoStart = new Date(windowStart).toISOString();
        const baseSeriesQuery = supabase
          .from('market_snapshots_norm')
          .select('karat, price, created_at, source')
          .eq('country', country)
          .gte('created_at', createdAtIsoStart)
          .order('created_at', { ascending: false });

        // Filter by source for country-specific sources
        if (country === 'EG') {
          // NOTE: keep this list aligned with ingestion sources for EG normalized data
          // (this path is only used when normalized table is fresh)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          // (Supabase query builder is immutable-ish; reassign below)
          // @ts-ignore
          baseSeriesQuery;
        } else if (country === 'AE') {
          // @ts-ignore
          baseSeriesQuery;
        } else if (country === 'SA') {
          // @ts-ignore
          baseSeriesQuery;
        } else if (country === 'US') {
          // @ts-ignore
          baseSeriesQuery;
        }

        // Apply source filters on a cloned query (per-country)
        // Match the exact sources used in lib/forecast.ts for consistency
        let seriesQuery = baseSeriesQuery;
        if (country === 'EG') {
          seriesQuery = seriesQuery.in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);
        } else if (country === 'AE') {
          seriesQuery = seriesQuery.in('source', ['goldprice_org_ae', 'global_parity']);
        } else if (country === 'SA') {
          seriesQuery = seriesQuery.in('source', ['goldprice_org_sa', 'global_parity']);
        } else if (country === 'US') {
          seriesQuery = seriesQuery.in('source', ['goldapi_spot']);
        }

        // Log the query parameters for debugging
        console.log('[Forecast Series] Query parameters:', {
          country,
          windowStart: createdAtIsoStart,
          windowMs: windowMs / (60 * 60 * 1000) + ' hours',
          sources: country === 'EG' ? ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'] :
                   country === 'AE' ? ['goldprice_org_ae', 'global_parity'] :
                   country === 'SA' ? ['goldprice_org_sa', 'global_parity'] :
                   ['goldapi_spot']
        });

        // Helper: page through PostgREST row caps
        const fetchPaged = async <T,>(q: any): Promise<{ rows: T[]; pages: number }> => {
          const rows: T[] = [];
          for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data, error } = await q.range(from, to);
            if (error) break;
            const batch = (data as T[]) || [];
            rows.push(...batch);
            if (batch.length < PAGE_SIZE) return { rows, pages: page + 1 };
          }
          return { rows, pages: MAX_PAGES };
        };

        // Try 24k first (paged)
        const { rows: data24k, pages: normPages24 } = await fetchPaged<any>(seriesQuery.eq('karat', 24));

        // For longer ranges, bucket more coarsely to preserve multi-day coverage and avoid row caps.
        const normBucketMs =
          rangeParam === 'daily'
            ? 60_000
            : rangeParam === 'weekly'
              ? 10 * 60_000
              : rangeParam === 'monthly'
                ? 60 * 60_000
                : 6 * 60 * 60_000; // yoy

        const bucketAvg = (rows: any[], scale: number = 1): Map<number, { sum: number; count: number }> => {
          const m = new Map<number, { sum: number; count: number }>();
          for (const row of rows) {
            const raw = Number(row.price);
            if (!isFinite(raw) || raw <= 0) continue;
            const createdAt =
              typeof row.created_at === 'string'
                ? new Date(row.created_at).getTime()
                : (typeof row.created_at === 'number' ? row.created_at : 0);
            if (!isFinite(createdAt) || createdAt <= 0) continue;
            const key = Math.floor(createdAt / normBucketMs) * normBucketMs;
            const prev = m.get(key) ?? { sum: 0, count: 0 };
            prev.sum += raw * scale;
            prev.count += 1;
            m.set(key, prev);
          }
          return m;
        };

        const toPoints = (m: Map<number, { sum: number; count: number }>): Array<{ t: number; v: number }> => {
          return Array.from(m.entries())
            .map(([t, agg]) => ({ t, v: agg.sum / Math.max(1, agg.count) }))
            .filter((p) => isFinite(p.v) && p.v > 0)
            .sort((a, b) => a.t - b.t);
        };

        // Build 24k points (if present)
        if (data24k && data24k.length > 0) {
          points = toPoints(bucketAvg(data24k, 1));
        } else {
          points = [];
        }

        // If EG long-range only has "same-day" 24k points, derive 24k from other karats to extend history.
        // This matches the wide-table derivation logic and fixes weekly/monthly/yoy showing only one date.
        let egDerived24kUsed = false;
        let egDerivedFrom: string | null = null;

        const wantHistoryDerivation =
          country === 'EG' &&
          scope === 'local' &&
          (rangeParam === 'weekly' || rangeParam === 'monthly' || rangeParam === 'yoy');

        const pointsSpanMs = points.length > 1 ? (points[points.length - 1].t - points[0].t) : 0;
        const minUsefulSpanMs =
          rangeParam === 'weekly'
            ? 36 * 60 * 60 * 1000 // 1.5d
            : rangeParam === 'monthly'
              ? 4 * 24 * 60 * 60 * 1000 // 4d
              : 14 * 24 * 60 * 60 * 1000; // 14d for yoy

        if (wantHistoryDerivation && pointsSpanMs < minUsefulSpanMs) {
          // Fetch other karats and derive 24k = k * 24/karat
          const [{ rows: data21k }, { rows: data18k }, { rows: data14k }] = await Promise.all([
            fetchPaged<any>(seriesQuery.eq('karat', 21)),
            fetchPaged<any>(seriesQuery.eq('karat', 18)),
            fetchPaged<any>(seriesQuery.eq('karat', 14)),
          ]);

          const b24 = data24k && data24k.length > 0 ? bucketAvg(data24k, 1) : new Map();
          const b21 = data21k && data21k.length > 0 ? bucketAvg(data21k, 24 / 21) : new Map();
          const b18 = data18k && data18k.length > 0 ? bucketAvg(data18k, 24 / 18) : new Map();
          const b14 = data14k && data14k.length > 0 ? bucketAvg(data14k, 24 / 14) : new Map();

          const allKeys = new Set<number>([
            ...b24.keys(),
            ...b21.keys(),
            ...b18.keys(),
            ...b14.keys(),
          ]);

          const merged = new Map<number, { sum: number; count: number; from: string }>();
          for (const k of allKeys) {
            // Prefer true 24k; then derived from 21/18/14.
            const pick =
              (b24.get(k) ? { agg: b24.get(k)!, from: '24' } : null) ??
              (b21.get(k) ? { agg: b21.get(k)!, from: '21' } : null) ??
              (b18.get(k) ? { agg: b18.get(k)!, from: '18' } : null) ??
              (b14.get(k) ? { agg: b14.get(k)!, from: '14' } : null);
            if (!pick) continue;
            merged.set(k, { sum: pick.agg.sum, count: pick.agg.count, from: pick.from });
          }

          const derivedPoints = toPoints(new Map(Array.from(merged.entries()).map(([t, v]) => [t, { sum: v.sum, count: v.count }])));

          const derivedSpanMs =
            derivedPoints.length > 1 ? (derivedPoints[derivedPoints.length - 1].t - derivedPoints[0].t) : 0;

          if (derivedPoints.length > 0 && derivedSpanMs > pointsSpanMs) {
            points = derivedPoints;
            egDerived24kUsed = true;
            // Prefer the first non-24 derivation we used (for debug)
            egDerivedFrom = '21/18/14';
            console.warn('[Forecast Series] Derived EG 24k series from other karats to extend history:', {
              oldSpanHours: Number((pointsSpanMs / 3_600_000).toFixed(2)),
              newSpanHours: Number((derivedSpanMs / 3_600_000).toFixed(2)),
              points: derivedPoints.length,
              bucketMs: normBucketMs,
            });
          }

          (request as any).__egDerived24kUsed = egDerived24kUsed;
          (request as any).__egDerivedFrom = egDerivedFrom;
        }

        // If we still have no points, fallback to 21k (keeps non-EG behavior intact)
        if (points.length === 0) {
          const { rows: data21k, pages: normPages21 } = await fetchPaged<any>(seriesQuery.eq('karat', 21));
          if (data21k && data21k.length > 0) {
            points = toPoints(bucketAvg(data21k, 1));
          }
          void normPages21;
        }

        void normPages24;
        
        originalPointsCount = points.length;
        lastDataAtMs = points.length > 0 ? points[points.length - 1].t : null;
        
        // Track coverage so we can pick the best long-range series for EG local.
        const computeSpanMs = (pts: Array<{ t: number; v: number }>) =>
          pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0;

        const egMinSpanMs =
          rangeParam === 'weekly'
            ? 36 * 60 * 60 * 1000 // 1.5d
            : rangeParam === 'monthly'
              ? 4 * 24 * 60 * 60 * 1000 // 4d
              : rangeParam === 'yoy'
                ? 14 * 24 * 60 * 60 * 1000 // 14d
                : 0;

        const egIsLongRange =
          country === 'EG' &&
          scope === 'local' &&
          (rangeParam === 'weekly' || rangeParam === 'monthly' || rangeParam === 'yoy');

        const normSpanMs = computeSpanMs(points);
        const coverageShort = egIsLongRange ? normSpanMs < egMinSpanMs : false;
        (request as any).__egCoverageShort = coverageShort;
        (request as any).__egNormSpanHoursRaw = egIsLongRange
          ? Number((normSpanMs / (1000 * 60 * 60)).toFixed(2))
          : null;

        // Coverage fallback (EG local weekly/monthly/yoy):
        // If we only have intraday points (e.g. due to high-frequency ingestion + row caps),
        // prefer the lower-frequency `aggregated` normalized series which should cover days/weeks.
        if (egIsLongRange && coverageShort) {
            try {
              const aggQuery = supabase
                .from('market_snapshots_norm')
                .select('karat, price, created_at, source')
                .eq('country', 'EG')
                .eq('source', 'aggregated')
                .gte('created_at', new Date(windowStart).toISOString())
                .order('created_at', { ascending: false });

              const { rows: aggRows } = await fetchPaged<any>(aggQuery);
              (request as any).__egAggRowsCount = aggRows ? aggRows.length : 0;
              if (aggRows && aggRows.length > 0) {
                const bucketMs =
                  rangeParam === 'weekly'
                    ? 30 * 60_000 // 30m
                    : rangeParam === 'monthly'
                      ? 2 * 60 * 60_000 // 2h
                      : 12 * 60 * 60_000; // 12h

                const buckets24 = new Map<number, number[]>();
                const buckets21 = new Map<number, number[]>();

                for (const row of aggRows) {
                  const price = Number(row.price);
                  if (!isFinite(price) || price <= 0) continue;
                  const createdAtMs =
                    typeof row.created_at === 'string'
                      ? new Date(row.created_at).getTime()
                      : (typeof row.created_at === 'number' ? row.created_at : 0);
                  if (!isFinite(createdAtMs) || createdAtMs <= 0) continue;
                  const key = Math.floor(createdAtMs / bucketMs) * bucketMs;
                  const karat = Number(row.karat);
                  if (karat === 24) {
                    if (!buckets24.has(key)) buckets24.set(key, []);
                    buckets24.get(key)!.push(price);
                  } else if (karat === 21) {
                    if (!buckets21.has(key)) buckets21.set(key, []);
                    buckets21.get(key)!.push(price);
                  }
                }

                const toAvgPoints = (m: Map<number, number[]>, scale: number) =>
                  Array.from(m.entries())
                    .map(([t, arr]) => ({ t, v: (arr.reduce((s, x) => s + x, 0) / arr.length) * scale }))
                    .filter((p) => isFinite(p.v) && p.v > 0)
                    .sort((a, b) => a.t - b.t);

                let aggPoints = toAvgPoints(buckets24, 1);
                if (aggPoints.length === 0) {
                  // Derive 24k from 21k if aggregated only stores 21k
                  aggPoints = toAvgPoints(buckets21, 24 / 21);
                }

                const aggSpanMs = computeSpanMs(aggPoints);
                (request as any).__egAggSpanHours = Number((aggSpanMs / (1000 * 60 * 60)).toFixed(2));

                // Prefer aggregated if it materially improves coverage.
                if (aggPoints.length > 1 && aggSpanMs > normSpanMs + 6 * 60 * 60 * 1000) {
                  points = aggPoints;
                  fallbackUsed = true;
                  fallbackSource = 'aggregated_history';
                  lastDataAtMs = points[points.length - 1].t;
                  (request as any).__egAggCoverageUsed = true;
                  console.warn('[Forecast Series] Using aggregated history for EG long-range coverage:', {
                    range: rangeParam,
                    prevSpanHours: Number((normSpanMs / (1000 * 60 * 60)).toFixed(2)),
                    aggSpanHours: Number((aggSpanMs / (1000 * 60 * 60)).toFixed(2)),
                    points: aggPoints.length,
                  });
                }
              }
            } catch (e) {
              console.error('[Forecast Series] aggregated coverage fallback failed:', e);
              (request as any).__egAggCoverageUsed = false;
              (request as any).__egAggError = e instanceof Error ? e.message : String(e);
            }
        }

        // If EG local looks stale/empty in normalized table, try the wide table (`market_snapshots`)
        // which may be where ingestion is actually writing intraday data.
        if (country === 'EG') {
          const latestPointTime = points.length > 0 ? points[points.length - 1].t : null;
          const hoursSinceLatest =
            latestPointTime !== null ? (now - latestPointTime) / (1000 * 60 * 60) : Infinity;

          let wideRowsCount: number | null = null;
          let widePointsCount: number | null = null;
          let wideHas24Count: number | null = null;
          let wideHas21Count: number | null = null;
          let wideHas18Count: number | null = null;
          let wideHas14Count: number | null = null;
          let wideLastAt24: number | null = null;
          let wideLastAt21: number | null = null;
          let wideLastAt18: number | null = null;
          let wideLastAt14: number | null = null;
          let widePagesFetched: number | null = null;
          let wideRowsScanned: number | null = null;
          let egyptMarketRowsCount: number | null = null;
          let egyptMarketPointsCount: number | null = null;
          let egyptMarketLatestAtMs: number | null = null;
          let egyptMarketError: string | null = null;

          if (points.length === 0 || hoursSinceLatest > 6 || coverageShort) {
            try {
              // Wide table `createdAt` may be TIMESTAMPTZ or bigint (legacy). Prefer ISO, then fallback to ms.
              const wideStartIso = new Date(windowStart).toISOString();
              const fetchWidePaged = async (useIso: boolean) => {
                const base = supabase
                  .from('market_snapshots')
                  // NOTE: wide table uses quoted/camelCase columns in Postgres ("createdAt", "market24Buy", ...)
                  .select('source, createdAt, market24Buy, market21Buy, market18Buy, market14Buy, error')
                  .is('error', null)
                  .order('createdAt', { ascending: false })
                  .gte('createdAt', useIso ? wideStartIso : (windowStart as any));

                const rows: any[] = [];
                let pages = 0;
                let lastError: any = null;
                for (let page = 0; page < MAX_PAGES; page++) {
                  const from = page * PAGE_SIZE;
                  const to = from + PAGE_SIZE - 1;
                  const { data, error } = await (base as any).range(from, to);
                  if (error) {
                    lastError = error;
                    break;
                  }
                  const batch = (data as any[]) || [];
                  rows.push(...batch);
                  pages = page + 1;
                  if (batch.length < PAGE_SIZE) break;
                }
                return { rows, pages, error: lastError };
              };

              let wideData: any[] = [];
              let widePages = 0;
              let wideErr: any = null;
              let wideFetchMode: 'iso' | 'ms' | null = null;

              const rIso = await fetchWidePaged(true);
              wideData = rIso.rows;
              widePages = rIso.pages;
              wideErr = rIso.error;
              wideFetchMode = 'iso';

              if (wideErr) {
                const msg = wideErr?.message ? String(wideErr.message) : String(wideErr);
                // Retry for legacy bigint epoch ms or if server rejects ISO
                if (msg.includes('bigint') || msg.includes('invalid input syntax') || msg.includes('timestamp')) {
                  const rMs = await fetchWidePaged(false);
                  wideData = rMs.rows;
                  widePages = rMs.pages;
                  wideErr = rMs.error;
                  wideFetchMode = 'ms';
                }
              }

              widePagesFetched = widePages;
              (request as any).__egWideFetchMode = wideFetchMode;
              (request as any).__egWideFetchError = wideErr?.message ? String(wideErr.message) : (wideErr ? String(wideErr) : null);
              (request as any).__egWideRowsCountRaw = wideData ? wideData.length : 0;

              if (wideData && wideData.length > 0) {
                wideRowsCount = wideData.length;
                wideRowsScanned = wideData.length;
                wideHas24Count = 0;
                wideHas21Count = 0;
                wideHas18Count = 0;
                wideHas14Count = 0;
                const bucketMs =
                  rangeParam === 'daily'
                    ? 60_000
                    : rangeParam === 'weekly'
                      ? 10 * 60_000
                      : rangeParam === 'monthly'
                        ? 60 * 60_000
                        : 6 * 60 * 60_000;

                const buckets = new Map<number, number[]>();
                for (const row of wideData) {
                  const t = typeof row.createdAt === 'number' ? row.createdAt : Number(row.createdAt);
                  if (!isFinite(t) || t <= 0) continue;
                  // Prefer true 24k; if missing, estimate 24k from other karats.
                  // This avoids huge "gaps" when only some karats are ingested for a period.
                  const v24 = Number(row.market24Buy);
                  const v21 = Number(row.market21Buy);
                  const v18 = Number(row.market18Buy);
                  const v14 = Number(row.market14Buy);

                  let v: number | null = null;
                  if (isFinite(v24) && v24 > 0) {
                    v = v24;
                    wideHas24Count! += 1;
                    wideLastAt24 = t;
                  } else if (isFinite(v21) && v21 > 0) {
                    v = (v21 * 24) / 21;
                    wideHas21Count! += 1;
                    wideLastAt21 = t;
                  } else if (isFinite(v18) && v18 > 0) {
                    v = (v18 * 24) / 18;
                    wideHas18Count! += 1;
                    wideLastAt18 = t;
                  } else if (isFinite(v14) && v14 > 0) {
                    v = (v14 * 24) / 14;
                    wideHas14Count! += 1;
                    wideLastAt14 = t;
                  }

                  if (v === null || !isFinite(v) || v <= 0) continue;
                  const key = Math.floor(t / bucketMs) * bucketMs;
                  if (!buckets.has(key)) buckets.set(key, []);
                  buckets.get(key)!.push(v);
                }

                const widePoints = Array.from(buckets.entries())
                  .map(([t, arr]) => ({ t, v: arr.reduce((s, x) => s + x, 0) / arr.length }))
                  .sort((a, b) => a.t - b.t);
                widePointsCount = widePoints.length;

                if (widePoints.length > 0) {
                  const wideLatest = widePoints[widePoints.length - 1].t;
                  const wideHoursSince = (now - wideLatest) / (1000 * 60 * 60);
                  const wideSpanMs =
                    widePoints.length > 1 ? widePoints[widePoints.length - 1].t - widePoints[0].t : 0;
                  (request as any).__egWideSpanHours = Number((wideSpanMs / (1000 * 60 * 60)).toFixed(2));

                  // Prefer wide table if it is fresher OR if it provides materially better history coverage.
                  const useForCoverage = coverageShort && wideSpanMs > normSpanMs + 6 * 60 * 60 * 1000;
                  if (latestPointTime === null || wideLatest > latestPointTime || useForCoverage) {
                    points = widePoints;
                    fallbackUsed = true;
                    fallbackSource = useForCoverage ? 'market_snapshots_wide_history' : 'market_snapshots_wide';
                    lastDataAtMs = wideLatest;
                    console.warn('[Forecast Series] Using EG wide snapshots for fresher intraday series:', {
                      widePoints: widePoints.length,
                      wideHoursSince: Number(wideHoursSince.toFixed(2)),
                      wideSpanHours: Number((wideSpanMs / (1000 * 60 * 60)).toFixed(2)),
                      normSpanHours: Number((normSpanMs / (1000 * 60 * 60)).toFixed(2)),
                      coverageShort,
                    });
                  }
                }
              }
            } catch (e) {
              console.error('[Forecast Series] Failed wide table fallback:', e);
            }
          }

          // Recompute staleness after potential wide fallback
          if (points.length > 0) {
            const latestAfter = points[points.length - 1].t;
            const hoursSinceAfter = (now - latestAfter) / (1000 * 60 * 60);

            if (hoursSinceAfter > 6) {
              console.warn(
                `[Forecast Series] EG local data is stale (${hoursSinceAfter.toFixed(1)} hours old). Attempting fallback...`
              );
            
            // Fallback 1: Try to get EG market median (aggregated source) across the requested window
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('market_snapshots_norm')
              .select('karat, price, created_at, source')
              .eq('country', 'EG')
              .eq('source', 'aggregated')
              .gte('created_at', new Date(windowStart).toISOString())
              .eq('karat', 24)
              // order DESC to ensure we include the latest points (row caps can otherwise hide "now")
              .order('created_at', { ascending: false })
              .range(0, 999);
            
            if (!fallbackError && fallbackData && fallbackData.length > 0) {
              // Use aggregated source data (bucket more coarsely for long ranges to preserve window coverage)
              const fallbackBuckets = new Map<number, number[]>();
              const bucketMs =
                rangeParam === 'daily'
                  ? 60_000
                  : rangeParam === 'weekly'
                    ? 10 * 60_000
                    : rangeParam === 'monthly'
                      ? 60 * 60_000
                      : 6 * 60 * 60_000;
              for (const row of fallbackData) {
              const price = Number(row.price);
              if (isFinite(price) && price > 0) {
                const createdAt = typeof row.created_at === 'string' 
                  ? new Date(row.created_at).getTime()
                  : (typeof row.created_at === 'number' ? row.created_at : 0);
                  const bucketKey = Math.floor(createdAt / bucketMs) * bucketMs;
                  
                  if (!fallbackBuckets.has(bucketKey)) {
                    fallbackBuckets.set(bucketKey, []);
                  }
                  fallbackBuckets.get(bucketKey)!.push(price);
                }
              }
              
              const fallbackPoints = Array.from(fallbackBuckets.entries())
              .map(([t, prices]) => ({
                t,
                v: prices.reduce((sum, p) => sum + p, 0) / prices.length,
              }))
              .sort((a, b) => a.t - b.t);
              
              if (fallbackPoints.length > 0) {
                const fallbackLatestTime = fallbackPoints[fallbackPoints.length - 1].t;
                const fallbackHoursSince = (now - fallbackLatestTime) / (1000 * 60 * 60);
                
                // Only use fallback if it's fresher than original AND not stale itself.
                // If aggregated is also stale, prefer GLOBAL spot estimate fallback below.
                if (fallbackHoursSince < hoursSinceLatest && fallbackHoursSince <= 6) {
                  points = fallbackPoints;
                  fallbackUsed = true;
                  fallbackSource = 'aggregated';
                  lastDataAtMs = points.length > 0 ? points[points.length - 1].t : lastDataAtMs;
                  console.log('[Forecast Series] Using aggregated fallback for EG:', fallbackPoints.length, 'points');
                }
              }
            }
            
            // Fallback 2: If aggregated also stale, use GLOBAL spot + USD/EGP estimate
            if (!fallbackUsed && goldSpotHistory.length > 0) {
              // Before GLOBAL spot, try egypt_market (legacy cached intraday EG sources like dahabmasr/goldbillion)
              // This is often where the "real" intraday EG points live.
              try {
                // egypt_market.fetched_at has existed in two shapes over time:
                // - TIMESTAMPTZ (ISO string)
                // - bigint epoch ms (legacy import)
                // Try ISO first; if type mismatch, retry with ms.
                const fetchedAtIso = new Date(windowStart).toISOString();
                const runEgyptMarketQuery = async (useIso: boolean) => {
                  let q = supabase
                    .from('egypt_market')
                    .select('source, fetched_at, status, market_24_buy, market_21_buy')
                    .order('fetched_at', { ascending: true })
                    .range(0, 4999);
                  q = q.gte('fetched_at', useIso ? fetchedAtIso : windowStart);
                  // Accept both OK and STALE (we’ll still apply the 6h freshness gate below)
                  q = q.in('status', ['OK', 'STALE']);
                  return await q;
                };

                let emRows: any[] | null = null;
                let emErr: any = null;
                const r1 = await runEgyptMarketQuery(true);
                emRows = (r1 as any).data ?? null;
                emErr = (r1 as any).error ?? null;
                if (emErr) {
                  const msg = emErr?.message ? String(emErr.message) : String(emErr);
                  // Retry for legacy bigint epoch ms
                  if (msg.includes('bigint') || msg.includes('invalid input syntax')) {
                    const r2 = await runEgyptMarketQuery(false);
                    emRows = (r2 as any).data ?? null;
                    emErr = (r2 as any).error ?? null;
                  }
                }
                if (emErr) {
                  egyptMarketError = emErr?.message ? String(emErr.message) : String(emErr);
                }

                if (!emErr && emRows && emRows.length > 0) {
                  egyptMarketRowsCount = emRows.length;
                  const bucketMs =
                    rangeParam === 'daily'
                      ? 60_000
                      : rangeParam === 'weekly'
                        ? 10 * 60_000
                        : rangeParam === 'monthly'
                          ? 60 * 60_000
                          : 6 * 60 * 60_000;

                  const buckets = new Map<number, number[]>();
                  for (const r of emRows as any[]) {
                    const t =
                      typeof r.fetched_at === 'string'
                        ? new Date(r.fetched_at).getTime()
                        : typeof r.fetched_at === 'number'
                          ? r.fetched_at
                          : 0;
                    if (!isFinite(t) || t <= 0) continue;
                    const vRaw = r.market_24_buy ?? r.market_21_buy;
                    const v = Number(vRaw);
                    if (!isFinite(v) || v <= 0) continue;
                    const key = Math.floor(t / bucketMs) * bucketMs;
                    if (!buckets.has(key)) buckets.set(key, []);
                    buckets.get(key)!.push(v);
                  }

                  const median = (arr: number[]) => {
                    const a = [...arr].sort((x, y) => x - y);
                    const mid = Math.floor(a.length / 2);
                    return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
                  };

                  const emPoints = Array.from(buckets.entries())
                    .map(([t, arr]) => ({ t, v: median(arr) }))
                    .sort((a, b) => a.t - b.t);

                  if (emPoints.length > 0) {
                    egyptMarketPointsCount = emPoints.length;
                    egyptMarketLatestAtMs = emPoints[emPoints.length - 1].t;
                    const emHoursSince = (now - egyptMarketLatestAtMs) / (1000 * 60 * 60);
                    if (emHoursSince <= 6) {
                      points = emPoints;
                      fallbackUsed = true;
                      fallbackSource = 'egypt_market';
                      lastDataAtMs = egyptMarketLatestAtMs;
                      console.warn('[Forecast Series] Using egypt_market fallback for EG local:', {
                        rows: egyptMarketRowsCount,
                        points: egyptMarketPointsCount,
                        emHoursSince: Number(emHoursSince.toFixed(2)),
                      });
                    }
                  }
                }
              } catch (e) {
                console.error('[Forecast Series] egypt_market fallback failed:', e);
              }

              try {
                const { getUsdEgpRate } = await import('@/lib/fx');
                const fxResult = await getUsdEgpRate();
                const egpRate = fxResult.rate;
                
                if (egpRate && egpRate > 0) {
                  // If spot history has a multi-day hole (common when gold_spot caching stalls),
                  // supplement with Stooq daily history across the requested window.
                  let spotSeries = [...goldSpotHistory];
                  if (rangeParam === 'weekly' || rangeParam === 'monthly' || rangeParam === 'yoy') {
                    const sorted = [...spotSeries].sort((a, b) => a.fetched_at - b.fetched_at);
                    const maxGapMs = sorted.reduce((max, cur, idx) => {
                      if (idx === 0) return max;
                      const dt = cur.fetched_at - sorted[idx - 1].fetched_at;
                      return dt > max ? dt : max;
                    }, 0);

                    const gapWarnMs =
                      rangeParam === 'weekly'
                        ? 36 * 60 * 60 * 1000
                        : rangeParam === 'monthly'
                          ? 48 * 60 * 60 * 1000
                          : 14 * 24 * 60 * 60 * 1000;

                    if (maxGapMs > gapWarnMs) {
                      const windowDays = Math.min(
                        420,
                        Math.max(7, Math.ceil(windowMs / (24 * 60 * 60 * 1000)) + 2)
                      );
                      const hist = await fetchStooqHistoryDaily(windowDays);
                      if (hist.points.length > 0) {
                        const haveDay = new Set(sorted.map((r) => new Date(r.fetched_at).toISOString().slice(0, 10)));
                        for (const pt of hist.points) {
                          if (pt.t < windowStart) continue;
                          const dayKey = new Date(pt.t).toISOString().slice(0, 10);
                          if (haveDay.has(dayKey)) continue;
                          haveDay.add(dayKey);
                          spotSeries.push({ xau_spot_usd_oz: pt.v, fetched_at: pt.t });
                        }
                        spotSeries.sort((a, b) => a.fetched_at - b.fetched_at);
                      }
                    }
                  }

                  // Convert global spot to EGP using FX rate
                  const fallbackPoints: Array<{ t: number; v: number }> = [];
                  for (const spot of spotSeries) {
                    // Convert XAU/USD to EGP per gram (24k)
                    // 1 oz = 31.1035 grams
                    const pricePerGramUsd = spot.xau_spot_usd_oz / 31.1035;
                    const pricePerGramEgp = pricePerGramUsd * egpRate;
                    // 24k price in EGP
                    fallbackPoints.push({
                      t: spot.fetched_at,
                      v: pricePerGramEgp,
                    });
                  }
                  
                  if (fallbackPoints.length > 0) {
                    points = fallbackPoints.sort((a, b) => a.t - b.t);
                    fallbackUsed = true;
                    fallbackSource = 'global_spot_egp_estimate';
                    lastDataAtMs = points.length > 0 ? points[points.length - 1].t : lastDataAtMs;
                    console.log('[Forecast Series] Using GLOBAL spot + EGP estimate fallback for EG:', fallbackPoints.length, 'points');
                  }
                }
              } catch (fxError) {
                console.error('[Forecast Series] Failed to get FX rate for fallback:', fxError);
              }
            }
            // Close: if (hoursSinceAfter > 6)
            }
          }

          // Expose minimal proof/debug in meta (helps validate "DB has rows but API didn't use them")
          // Only set when EG local attempted.
          (request as any).__egWideRowsCount = wideRowsCount;
          (request as any).__egWidePointsCount = widePointsCount;
          (request as any).__egWideHas24Count = wideHas24Count;
          (request as any).__egWideHas21Count = wideHas21Count;
          (request as any).__egWideHas18Count = wideHas18Count;
          (request as any).__egWideHas14Count = wideHas14Count;
          (request as any).__egWideLastAt24 = wideLastAt24 ? new Date(wideLastAt24).toISOString() : null;
          (request as any).__egWideLastAt21 = wideLastAt21 ? new Date(wideLastAt21).toISOString() : null;
          (request as any).__egWideLastAt18 = wideLastAt18 ? new Date(wideLastAt18).toISOString() : null;
          (request as any).__egWideLastAt14 = wideLastAt14 ? new Date(wideLastAt14).toISOString() : null;
          (request as any).__egWidePagesFetched = widePagesFetched;
          (request as any).__egWideRowsScanned = wideRowsScanned;
          (request as any).__egEgyptMarketRowsCount = egyptMarketRowsCount;
          (request as any).__egEgyptMarketPointsCount = egyptMarketPointsCount;
          (request as any).__egEgyptMarketLatestAt = egyptMarketLatestAtMs
            ? new Date(egyptMarketLatestAtMs).toISOString()
            : null;
          (request as any).__egEgyptMarketError = egyptMarketError;
        }

        // Final coverage fallback (EG local weekly/monthly/yoy):
        // If we *still* only have intraday coverage, fall back to GLOBAL spot history converted to EGP.
        // This ensures the weekly/monthly selector actually shows a multi-day range even if local sources
        // only have today's intraday points.
        if (egIsLongRange) {
          const finalSpanMs = computeSpanMs(points);
          if (finalSpanMs < egMinSpanMs && goldSpotHistory.length > 0) {
            try {
              const egpRate =
                latestFx ??
                (await (async () => {
                  const { getUsdEgpRate } = await import('@/lib/fx');
                  const fxResult = await getUsdEgpRate();
                  return fxResult.rate;
                })());

              if (egpRate && egpRate > 0) {
                const sortedSpot = [...goldSpotHistory].sort((a, b) => a.fetched_at - b.fetched_at);
                const est = sortedSpot.map((spot) => {
                  const pricePerGramUsd = spot.xau_spot_usd_oz / 31.1035;
                  const pricePerGramEgp = pricePerGramUsd * egpRate;
                  return { t: spot.fetched_at, v: pricePerGramEgp };
                });

                const estSpanMs = computeSpanMs(est);
                (request as any).__egGlobalEstimateSpanHours = Number((estSpanMs / (1000 * 60 * 60)).toFixed(2));

                if (est.length > 1 && estSpanMs > finalSpanMs + 12 * 60 * 60 * 1000) {
                  points = est;
                  fallbackUsed = true;
                  fallbackSource = 'global_spot_egp_estimate_history_coverage';
                  lastDataAtMs = points[points.length - 1].t;
                  (request as any).__egCoverageFallbackUsed = true;
                }
              }
            } catch (e) {
              (request as any).__egCoverageFallbackUsed = false;
            }
          }
        }

        // NOTE: We do NOT auto-fallback EG weekly/monthly/yoy to GLOBAL history just because local coverage
        // is partial. The UX requirement is "from today till the eldest data found" (no empty graph),
        // which is handled on the chart domain. Only fallback to GLOBAL history if we have *no* local data.
        if (
          country === 'EG' &&
          (rangeParam === 'weekly' || rangeParam === 'monthly' || rangeParam === 'yoy') &&
          goldSpotHistory.length > 0 &&
          points.length === 0
        ) {
          try {
            const egpRate =
              latestFx ??
              (await (async () => {
                const { getUsdEgpRate } = await import('@/lib/fx');
                const fxResult = await getUsdEgpRate();
                return fxResult.rate;
              })());

            if (egpRate && egpRate > 0) {
              const sortedSpot = [...goldSpotHistory].sort((a, b) => a.fetched_at - b.fetched_at);
              const fallbackPoints = sortedSpot.map((spot) => {
                const pricePerGramUsd = spot.xau_spot_usd_oz / 31.1035;
                const pricePerGramEgp = pricePerGramUsd * egpRate;
                return { t: spot.fetched_at, v: pricePerGramEgp };
              });

              if (fallbackPoints.length > 1) {
                points = fallbackPoints;
                fallbackUsed = true;
                fallbackSource = 'global_spot_egp_estimate_history';
                lastDataAtMs = points.length > 0 ? points[points.length - 1].t : lastDataAtMs;
              }
            }
          } catch (error) {
            console.error('[Forecast Series] Failed EG history fallback:', error);
          }
        }

        // Note: We do NOT "carry-forward" the last point to now.
        // Doing so creates a misleading flat line when the upstream source is stale.
        
        console.log('[Forecast Series] Local market data for country', country, ':', points.length, 'points', fallbackUsed ? `(fallback: ${fallbackSource})` : '');
      }
    }

    // Cap points per range for chart sanity and downsample uniformly if needed
    // Increase max points to show more data (chart can handle more)
    const maxPointsMap: Record<string, number> = {
      daily: 500,     // 7 days: ~71 points/day, allow up to 500 for better granularity
      weekly: 500,    // Same as daily (7 days)
      monthly: 600,   // 30 days: ~20 points/day
      yoy: 800,       // 365 days: ~2-3 points/day
    };

    const maxPoints = rangeParam && maxPointsMap[rangeParam] ? maxPointsMap[rangeParam] : 500;
    
    console.log('[Forecast Series] Before downsampling:', points.length, 'points. Max allowed:', maxPoints);
    
    if (points.length > maxPoints) {
      // Downsample uniformly - preserve first and last points
      const step = (points.length - 1) / (maxPoints - 1);
      const downsampled: Array<{ t: number; v: number }> = [];
      
      // Always include first point
      downsampled.push(points[0]);
      
      // Sample intermediate points
      for (let i = 1; i < maxPoints - 1; i++) {
        const idx = Math.round(i * step);
        if (idx < points.length) {
          downsampled.push(points[idx]);
        }
      }
      
      // Always include last point if we have more than 1 point
      if (points.length > 1) {
        downsampled.push(points[points.length - 1]);
      }
      
      points = downsampled;
      console.log('[Forecast Series] After downsampling:', points.length, 'points');
    }

    // Ensure points are sorted by timestamp (ascending)
    points.sort((a, b) => a.t - b.t);

    // Determine unit based on scope and country
    const unit = scope === 'global' ? 'USD' : getCountryCurrency(country);
    
    // Determine range label
    const rangeLabel = rangeParam || 'custom';

    // Calculate lastPointAt (ISO timestamp of the latest point we are returning),
    // and lastDataAt (ISO timestamp of the latest *observed* data point, before carry-forward).
    const lastPointAt = points.length > 0 ? new Date(points[points.length - 1].t).toISOString() : null;
    const lastDataAt = lastDataAtMs !== null ? new Date(lastDataAtMs).toISOString() : null;

    // Server timestamp (when this response was generated)
    const serverAsOf = new Date().toISOString();

    // Determine source identifier (what ultimately powered the returned series)
    const source =
      scope === 'global'
        ? 'gold_spot_history'
        : fallbackUsed && fallbackSource
          ? `fallback:${fallbackSource}`
          : `market_snapshots_norm_${country}`;

    const response = NextResponse.json({
      timestamp: Date.now(),
      points,
      meta: {
        apiVersion: API_VERSION,
        scope,
        range: rangeLabel,
        unit,
        country,
        serverAsOf,
        lastPointAt,
        lastDataAt,
        pointsCount: points.length,
        source,
        fallbackUsed: fallbackUsed || false,
        fallbackSource: fallbackSource || null,
        egWideRowsCount: (request as any).__egWideRowsCount ?? null,
        egWidePointsCount: (request as any).__egWidePointsCount ?? null,
        egWideHas24Count: (request as any).__egWideHas24Count ?? null,
        egWideHas21Count: (request as any).__egWideHas21Count ?? null,
        egWideHas18Count: (request as any).__egWideHas18Count ?? null,
        egWideHas14Count: (request as any).__egWideHas14Count ?? null,
        egWideLastAt24: (request as any).__egWideLastAt24 ?? null,
        egWideLastAt21: (request as any).__egWideLastAt21 ?? null,
        egWideLastAt18: (request as any).__egWideLastAt18 ?? null,
        egWideLastAt14: (request as any).__egWideLastAt14 ?? null,
        egWidePagesFetched: (request as any).__egWidePagesFetched ?? null,
        egWideRowsScanned: (request as any).__egWideRowsScanned ?? null,
        egWideFetchMode: (request as any).__egWideFetchMode ?? null,
        egWideFetchError: (request as any).__egWideFetchError ?? null,
        egWideRowsCountRaw: (request as any).__egWideRowsCountRaw ?? null,
        egWideSpanHours: (request as any).__egWideSpanHours ?? null,
        egEgyptMarketRowsCount: (request as any).__egEgyptMarketRowsCount ?? null,
        egEgyptMarketPointsCount: (request as any).__egEgyptMarketPointsCount ?? null,
        egEgyptMarketLatestAt: (request as any).__egEgyptMarketLatestAt ?? null,
        egEgyptMarketError: (request as any).__egEgyptMarketError ?? null,
        egDerived24kUsed: (request as any).__egDerived24kUsed ?? null,
        egDerivedFrom: (request as any).__egDerivedFrom ?? null,
        egAggCoverageUsed: (request as any).__egAggCoverageUsed ?? null,
        egAggSpanHours: (request as any).__egAggSpanHours ?? null,
        egAggRowsCount: (request as any).__egAggRowsCount ?? null,
        egAggError: (request as any).__egAggError ?? null,
        egCoverageShort: (request as any).__egCoverageShort ?? null,
        egNormSpanHoursRaw: (request as any).__egNormSpanHoursRaw ?? null,
        egGlobalEstimateSpanHours: (request as any).__egGlobalEstimateSpanHours ?? null,
        egCoverageFallbackUsed: (request as any).__egCoverageFallbackUsed ?? null,
        egNormSpanHours: country === 'EG' && scope === 'local' && points.length > 1
          ? Number((((points[points.length - 1].t - points[0].t) / (1000 * 60 * 60))).toFixed(2))
          : null,
      },
    });

    // Ensure no caching - comprehensive headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('x-egp-forecast-series-version', API_VERSION);

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Forecast series API error:', errorMessage);

    const serverAsOf = new Date().toISOString();

    const response = NextResponse.json(
      {
        timestamp: Date.now(),
        error: 'Failed to fetch forecast series',
        errorMessage,
        points: [],
        meta: {
          serverAsOf,
          lastPointAt: null,
          pointsCount: 0,
          source: 'error',
        },
      },
      { status: 200 } // Always return 200, even on error
    );

    // Ensure no caching - comprehensive headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  }
}

