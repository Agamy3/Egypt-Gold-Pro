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
const API_VERSION = '2026-01-15T11:06Z';

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
        let seriesQuery = supabase
          .from('market_snapshots_norm')
          .select('karat, price, created_at, source')
          .eq('country', country)
          .gte('created_at', new Date(windowStart).toISOString())
          .order('created_at', { ascending: true });

        // Filter by source for country-specific sources
        if (country === 'EG') {
          seriesQuery = seriesQuery.in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);
        } else if (country === 'AE') {
          seriesQuery = seriesQuery.in('source', ['goldprice_org_ae', 'global_parity']);
        } else if (country === 'SA') {
          seriesQuery = seriesQuery.in('source', ['goldprice_org_sa', 'global_parity']);
        } else if (country === 'US') {
          seriesQuery = seriesQuery.in('source', ['goldapi_spot']);
        }

        // Try 24k first
        const { data: data24k, error: error24k } = await seriesQuery.eq('karat', 24);
        
        if (!error24k && data24k && data24k.length > 0) {
          // Group by 10-second buckets and average prices
          const timeBuckets = new Map<number, number[]>();
          for (const row of data24k) {
            const price = Number(row.price);
            if (isFinite(price) && price > 0) {
              const createdAt = typeof row.created_at === 'string' 
                ? new Date(row.created_at).getTime()
                : (typeof row.created_at === 'number' ? row.created_at : 0);
              const bucketKey = Math.floor(createdAt / 10000) * 10000; // 10-second buckets
              
              if (!timeBuckets.has(bucketKey)) {
                timeBuckets.set(bucketKey, []);
              }
              timeBuckets.get(bucketKey)!.push(price);
            }
          }
          
          // Convert to points (average prices per bucket)
          points = Array.from(timeBuckets.entries())
            .map(([t, prices]) => ({
              t,
              v: prices.reduce((sum, p) => sum + p, 0) / prices.length, // Average
            }))
            .sort((a, b) => a.t - b.t);
        } else {
          // Fallback to 21k
          const { data: data21k, error: error21k } = await seriesQuery.eq('karat', 21);
          if (!error21k && data21k && data21k.length > 0) {
            const timeBuckets = new Map<number, number[]>();
            for (const row of data21k) {
              const price = Number(row.price);
              if (isFinite(price) && price > 0) {
                const createdAt = typeof row.created_at === 'string' 
                  ? new Date(row.created_at).getTime()
                  : (typeof row.created_at === 'number' ? row.created_at : 0);
                const bucketKey = Math.floor(createdAt / 10000) * 10000;
                
                if (!timeBuckets.has(bucketKey)) {
                  timeBuckets.set(bucketKey, []);
                }
                timeBuckets.get(bucketKey)!.push(price);
              }
            }
            
            points = Array.from(timeBuckets.entries())
              .map(([t, prices]) => ({
                t,
                v: prices.reduce((sum, p) => sum + p, 0) / prices.length,
              }))
              .sort((a, b) => a.t - b.t);
          }
        }
        
        originalPointsCount = points.length;
        lastDataAtMs = points.length > 0 ? points[points.length - 1].t : null;
        
        // Check staleness for EG local: if latest point is > 6 hours old, use fallback
        if (country === 'EG' && points.length > 0) {
          const latestPointTime = points[points.length - 1].t;
          const hoursSinceLatest = (now - latestPointTime) / (1000 * 60 * 60);
          
          if (hoursSinceLatest > 6) {
            console.warn(`[Forecast Series] EG local data is stale (${hoursSinceLatest.toFixed(1)} hours old). Attempting fallback...`);
            
            // Fallback 1: Try to get EG market median (aggregated source) across the requested window
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('market_snapshots_norm')
              .select('karat, price, created_at, source')
              .eq('country', 'EG')
              .eq('source', 'aggregated')
              .gte('created_at', new Date(windowStart).toISOString())
              .eq('karat', 24)
              .order('created_at', { ascending: true })
              .range(0, 4999);
            
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
          }
        }

        // EG-local history coverage fallback (weekly/monthly/yoy):
        // If the local table doesn't contain enough historical points to cover the requested window,
        // fall back to GLOBAL spot converted to EGP (temporary) so the monthly chart isn't "only today".
        if (
          country === 'EG' &&
          (rangeParam === 'weekly' || rangeParam === 'monthly' || rangeParam === 'yoy') &&
          goldSpotHistory.length > 0
        ) {
          const desiredWindowMs = windowMs;
          const coverageMs =
            points.length > 1 ? (points[points.length - 1].t - points[0].t) : 0;

          // If coverage is less than 60% of desired window, treat it as insufficient history.
          if (coverageMs < desiredWindowMs * 0.6) {
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
                  // Convert XAU/USD (per oz) -> USD per gram -> EGP per gram (24k)
                  const pricePerGramUsd = spot.xau_spot_usd_oz / 31.1035;
                  const pricePerGramEgp = pricePerGramUsd * egpRate;
                  return { t: spot.fetched_at, v: pricePerGramEgp };
                });

                if (fallbackPoints.length > 1) {
                  points = fallbackPoints;
                  fallbackUsed = true;
                  fallbackSource = 'global_spot_egp_estimate_history';
                  lastDataAtMs = points.length > 0 ? points[points.length - 1].t : lastDataAtMs;
                  console.log('[Forecast Series] Using EG monthly history fallback:', {
                    originalPointsCount,
                    windowDays: Math.round(windowMs / (24 * 60 * 60 * 1000)),
                    spotPoints: fallbackPoints.length,
                  });
                }
              }
            } catch (error) {
              console.error('[Forecast Series] Failed EG history fallback:', error);
            }
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

    // Determine source identifier
    const source = scope === 'global' 
      ? 'gold_spot_history' 
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

