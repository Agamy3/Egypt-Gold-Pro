/**
 * Forecast Series API
 * 
 * Returns time-series data for forecast chart
 * GET /api/forecast/series?minutes=120
 */

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getGoldSpotHistory } from '@/lib/supabase/goldSpot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    
    // Map range to minutes if provided
    // Use 7 days (same as forecast) to ensure we have all available data
    const rangeMap: Record<string, number> = {
      daily: 7 * 24 * 60,      // 7 days = 10080 minutes
      weekly: 7 * 24 * 60,      // 7 days (same as forecast window)
      monthly: 30 * 24 * 60,    // 30 days
      yoy: 365 * 24 * 60,       // 1 year
    };
    
    let minutes = 7 * 24 * 60; // default to 7 days to match forecast window
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

    // Get snapshots from Supabase (SQLite-compatible schema)
    // Determine limit based on range - increase limits to avoid missing data
    // For 7 days with 1 snapshot/minute = 10,080 snapshots max
    // Set limits higher to ensure we get all data
    const baseLimitMap: Record<string, number> = {
      daily: 15000,    // 7 days * 144 snapshots/day (1 per 10 min) = ~10K, add buffer
      weekly: 15000,   // Same as daily (7 days)
      monthly: 50000,  // 30 days with buffer
      yoy: 200000,     // 1 year with buffer
    };
    const effectiveRangeKey = rangeParam && baseLimitMap[rangeParam] ? rangeParam : 'daily';
    const snapshotLimit = baseLimitMap[effectiveRangeKey];
    
    console.log('[Forecast Series] Query limit:', snapshotLimit, 'for range:', effectiveRangeKey);

    // Query using SQLite-compatible schema
    // Note: createdAt is stored as bigint (epoch ms), so we compare directly
    // Supabase PostgREST: for quoted identifiers in schema, use them without quotes in JS client
    // The schema has "createdAt" (quoted in SQL) but we access as createdAt (no quotes) in JS
    let snapshotQuery = db.supabase
      .from('market_snapshots')
      .select('createdAt, market21Buy, market24Buy, error, source')
      .gte('createdAt', windowStart)
      .is('error', null)
      .order('createdAt', { ascending: false })
      .limit(snapshotLimit);

    // For trusted mode, filter by source (goldbullioneg is trusted)
    if (EGYPT_TRUSTED_ONLY_MODE) {
      snapshotQuery = snapshotQuery.eq('source', 'goldbullioneg');
    }

    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
    
    // Log for debugging
    if (snapshotError) {
      console.error('[Forecast Series] Query error:', snapshotError);
    }
    if (!snapshotRows || snapshotRows.length === 0) {
      console.log('[Forecast Series] No snapshots found. Window start:', windowStart, 'Now:', now, 'Window ms:', windowMs, 'Trusted mode:', EGYPT_TRUSTED_ONLY_MODE);
    } else {
      console.log('[Forecast Series] Found', snapshotRows.length, 'snapshots. First snapshot:', snapshotRows[0]);
    }

    // Transform to snapshot format - use ALL snapshots, don't bucket aggressively
    // Only bucket if we have multiple snapshots within the same 10-second window to avoid exact duplicates
    const snapshotsByTime = new Map<number, {
      createdAt: number;
      market21Buy: number | null;
      market24Buy: number | null;
      count: number; // Track how many snapshots were merged
    }>();

    if (snapshotRows) {
      console.log('[Forecast Series] Processing', snapshotRows.length, 'raw snapshot rows');
      for (const row of snapshotRows) {
        // Skip if no valid prices
        const has21k = row.market21Buy !== null && isFinite(row.market21Buy) && row.market21Buy > 0;
        const has24k = row.market24Buy !== null && isFinite(row.market24Buy) && row.market24Buy > 0;
        
        if (!has21k && !has24k) continue;

        const rowTimestamp = row.createdAt as number; // Already in epoch ms
        // Use 10-second buckets instead of 1-minute to preserve more granularity
        // This groups snapshots that are essentially duplicates (within 10 seconds)
        const timeBucket = Math.floor(rowTimestamp / 10000) * 10000;
        
        if (!snapshotsByTime.has(timeBucket)) {
          snapshotsByTime.set(timeBucket, {
            createdAt: timeBucket,
            market21Buy: null,
            market24Buy: null,
            count: 0,
          });
        }
        const snapshot = snapshotsByTime.get(timeBucket)!;
        snapshot.count++;
        
        // Set price for the appropriate karat (prefer 24k, fallback to 21k for local scope)
        // Use the latest value (or average if multiple in same bucket)
        if (has24k) {
          if (snapshot.market24Buy === null) {
            snapshot.market24Buy = row.market24Buy as number;
          } else {
            // Average if multiple values in same bucket
            snapshot.market24Buy = (snapshot.market24Buy * (snapshot.count - 1) + (row.market24Buy as number)) / snapshot.count;
          }
        }
        
        if (has21k && snapshot.market24Buy === null) {
          // Only use 21k if 24k is not available
          if (snapshot.market21Buy === null) {
            snapshot.market21Buy = row.market21Buy as number;
          } else {
            // Average if multiple values in same bucket
            snapshot.market21Buy = (snapshot.market21Buy * (snapshot.count - 1) + (row.market21Buy as number)) / snapshot.count;
          }
        }
      }
      
      console.log('[Forecast Series] Created', snapshotsByTime.size, 'time buckets from', snapshotRows.length, 'raw rows');
    }

    // Convert to array and sort by timestamp (ascending for chart)
    const snapshots = Array.from(snapshotsByTime.values())
      .map(({ count, ...rest }) => rest) // Remove count field
      .sort((a, b) => a.createdAt - b.createdAt);
    
    console.log('[Forecast Series] After time bucketing:', snapshots.length, 'snapshots. Sample:', snapshots.slice(0, 3));

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
      // Local scope: return local market buy price series
      // Use market24Buy (preferred) or market21Buy as fallback
      for (const snapshot of snapshots) {
        const marketBuy = snapshot.market24Buy ?? snapshot.market21Buy;
        
        if (marketBuy !== null && isFinite(marketBuy) && marketBuy > 0) {
          points.push({
            t: snapshot.createdAt,
            v: marketBuy,
          });
        }
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

    // Determine unit based on scope (simplified to match chart props)
    const unit = scope === 'global' ? 'USD' : 'EGP';
    
    // Determine range label
    const rangeLabel = rangeParam || 'custom';

    return NextResponse.json({
      timestamp: Date.now(),
      points,
      meta: {
        scope,
        range: rangeLabel,
        unit,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Forecast series API error:', errorMessage);

    return NextResponse.json(
      {
        timestamp: Date.now(),
        error: 'Failed to fetch forecast series',
        errorMessage,
        points: [],
      },
      { status: 200 } // Always return 200, even on error
    );
  }
}

