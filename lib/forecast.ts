/**
 * Market Forecast Module
 * 
 * Computes directional forecast for 21k gold prices using stored snapshot data
 * Uses explainable scoring model (no external ML services)
 */

import db from './supabase';
import { getGoldSpotHistory } from './supabase/goldSpot';
import { calculatePricing } from './pricing';

// Trusted source configuration (safe defaults, no undefined errors)
// Note: This function is called from API routes which should pass trustedMode
// For backward compatibility, we check env vars as fallback
function getTrustedModeFromEnv(): boolean {
  return (
    process.env.EGYPT_TRUSTED_ONLY_MODE === 'true' ||
    process.env.NEXT_PUBLIC_EGYPT_TRUSTED_ONLY_MODE === 'true'
  );
}

const TRUSTED_EGYPT_SOURCE = 'goldbullioneg';

export interface ForecastResult {
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  confidence: 'LOW' | 'MED' | 'HIGH';
  horizonMinutes: number;
  score: number;
  components: {
    momentum21k: number; // % change in 21k buy price
    varianceDelta: number; // change in variancePct
    fxDelta: number; // change in implied FX
    ounceDelta: number; // change in implied ounce USD
  };
  reasons: string[];
  snapshotCount: number;
  insufficientData: boolean;
}

// Use as much historical data as available (up to 7 days)
// This allows forecasting based on longer trends
const FORECAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days window (use all available historical data)
const HORIZON_MINUTES = 120; // 2 hours forecast horizon (predict next 2 hours)

// Thresholds for forecast reliability (adjusted for longer window)
const MIN_SNAPSHOTS_FOR_FORECAST = 10; // Minimum snapshots needed to attempt a forecast (reduced from 20 to 10 to work with less data)
const LOW_CONFIDENCE_THRESHOLD = 30; // Snapshots needed for MED confidence (reduced from 50)
const HIGH_CONFIDENCE_THRESHOLD = 100; // Snapshots needed for HIGH confidence (reduced from 150)

/**
 * Calculate forecast using stored snapshot data
 * @param country - Country code (EG, AE, SA, US)
 * @param trustedMode - Whether to use only trusted sources
 */
export async function calculateForecast(
  country: 'EG' | 'AE' | 'SA' | 'US' = 'EG',
  trustedMode: boolean = false
): Promise<ForecastResult> {
  const now = Date.now();
  const windowStartMs = now - FORECAST_WINDOW_MS;
  const windowStart = new Date(windowStartMs).toISOString();

  try {
    // Get snapshots from Supabase normalized schema
    // Filter by trusted source if trusted-only mode is enabled
    const isTrustedMode = trustedMode || getTrustedModeFromEnv();
    
    // Determine sources based on country
    let allowedSources: string[] = [];
    if (country === 'EG') {
      allowedSources = ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'];
      if (isTrustedMode) {
        allowedSources = ['goldbullioneg'];
      }
    } else if (country === 'AE') {
      allowedSources = ['goldprice_org_ae', 'global_parity'];
    } else if (country === 'SA') {
      allowedSources = ['goldprice_org_sa', 'global_parity'];
    } else if (country === 'US') {
      allowedSources = ['goldapi_spot'];
    }

    // Query normalized schema
    let snapshotQuery = db.supabase
      .from('market_snapshots_norm')
      .select('source, karat, price, created_at')
      .eq('country', country)
      .gte('created_at', windowStart)
      .in('karat', [21, 24])
      .in('source', allowedSources)
      .order('created_at', { ascending: true });

    if (isTrustedMode && country === 'EG') {
      snapshotQuery = snapshotQuery.eq('trusted', true);
    }

    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
    
    // Log query results for debugging
    if (snapshotError) {
      console.error('[Forecast] Query error:', snapshotError);
    } else {
      const latestRow = snapshotRows && snapshotRows.length > 0 
        ? snapshotRows.reduce((latest, row) => {
            const rowTime = typeof row.created_at === 'string' ? new Date(row.created_at).getTime() : (typeof row.created_at === 'number' ? row.created_at : 0);
            const latestTime = typeof latest.created_at === 'string' ? new Date(latest.created_at).getTime() : (typeof latest.created_at === 'number' ? latest.created_at : 0);
            return rowTime > latestTime ? row : latest;
          })
        : null;
      const oldestRow = snapshotRows && snapshotRows.length > 0
        ? snapshotRows.reduce((oldest, row) => {
            const rowTime = typeof row.created_at === 'string' ? new Date(row.created_at).getTime() : (typeof row.created_at === 'number' ? row.created_at : 0);
            const oldestTime = typeof oldest.created_at === 'string' ? new Date(oldest.created_at).getTime() : (typeof oldest.created_at === 'number' ? oldest.created_at : 0);
            return rowTime < oldestTime ? row : oldest;
          })
        : null;
      
      console.log('[Forecast] Query results:', {
        country,
        totalRows: snapshotRows?.length || 0,
        windowStart: new Date(windowStart).toISOString(),
        now: new Date(now).toISOString(),
        latestSnapshot: latestRow ? {
          created_at: typeof latestRow.created_at === 'string' ? latestRow.created_at : new Date(latestRow.created_at).toISOString(),
          source: latestRow.source,
          karat: latestRow.karat,
          minutesAgo: (now - (typeof latestRow.created_at === 'string' ? new Date(latestRow.created_at).getTime() : latestRow.created_at)) / (60 * 1000),
        } : null,
        oldestSnapshot: oldestRow ? {
          created_at: typeof oldestRow.created_at === 'string' ? oldestRow.created_at : new Date(oldestRow.created_at).toISOString(),
          daysAgo: (now - (typeof oldestRow.created_at === 'string' ? new Date(oldestRow.created_at).getTime() : oldestRow.created_at)) / (24 * 60 * 60 * 1000),
        } : null,
      });
    }

    // Transform normalized schema to snapshot format (group by time bucket)
    const snapshotsByTime = new Map<number, {
      createdAt: number;
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
      source: string;
    }>();

    if (!snapshotError && snapshotRows) {
      // Group by time bucket (10 seconds)
      for (const row of snapshotRows) {
        const price = Number(row.price);
        const karat = Number(row.karat);
        
        // Skip if invalid price
        if (!isFinite(price) || price <= 0) {
          continue;
        }

        // Parse created_at timestamp
        const createdAt = typeof row.created_at === 'string' 
          ? new Date(row.created_at).getTime()
          : (typeof row.created_at === 'number' ? row.created_at : 0);
        
        // Round to nearest 10 seconds for grouping
        const timeBucket = Math.floor(createdAt / 10000) * 10000;
        
        if (!snapshotsByTime.has(timeBucket)) {
          snapshotsByTime.set(timeBucket, {
            createdAt: timeBucket,
            market21Buy: null,
            market21Sell: null,
            market24Buy: null,
            market24Sell: null,
            source: row.source as string,
          });
        }
        const snapshot = snapshotsByTime.get(timeBucket)!;
        
        // Set prices based on karat (average if multiple values in same bucket)
        if (karat === 21) {
          if (snapshot.market21Buy === null) {
            snapshot.market21Buy = price;
          } else {
            snapshot.market21Buy = (snapshot.market21Buy + price) / 2;
          }
        } else if (karat === 24) {
          if (snapshot.market24Buy === null) {
            snapshot.market24Buy = price;
          } else {
            snapshot.market24Buy = (snapshot.market24Buy + price) / 2;
          }
        }
      }
    }

    const snapshots = Array.from(snapshotsByTime.values()).sort((a, b) => a.createdAt - b.createdAt);

    // Filter out snapshots that don't have at least one price (21k or 24k)
    const validSnapshots = snapshots.filter(s => s.market21Buy !== null || s.market24Buy !== null);

    // Get global gold spot price data from Supabase
    const goldSpotData = await getGoldSpotHistory(windowStartMs);

    // Check if we have sufficient data
    // Need at least MIN_SNAPSHOTS_FOR_FORECAST valid snapshots to attempt a forecast
    if (validSnapshots.length < MIN_SNAPSHOTS_FOR_FORECAST) {
      return {
        direction: 'SIDEWAYS',
        confidence: 'LOW',
        horizonMinutes: HORIZON_MINUTES,
        score: 0,
        components: {
          momentum21k: 0,
          varianceDelta: 0,
          fxDelta: 0,
          ounceDelta: 0,
        },
        reasons: [`Insufficient snapshot data for forecast (need at least ${MIN_SNAPSHOTS_FOR_FORECAST}, have ${validSnapshots.length})`],
        snapshotCount: validSnapshots.length,
        insufficientData: true,
      };
    }

    // Use valid snapshots for the rest of the forecast
    const snapshotsToUse = validSnapshots;
    const snapshotCount = snapshotsToUse.length;

    // Calculate median prices at start and end of window
    // Use market21Buy if available, otherwise market24Buy
    // For longer windows, use larger time buckets to reduce noise
    const bucketSizeMs = snapshotCount > 500 
      ? 60 * 60 * 1000  // 1-hour buckets for large datasets (>500 snapshots)
      : snapshotCount > 200
      ? 30 * 60 * 1000  // 30-minute buckets for medium datasets (>200 snapshots)
      : 5 * 60 * 1000;  // 5-minute buckets for small datasets
    
    const snapshotsByTimeBucket = snapshotsToUse.reduce((acc, s) => {
      const price = s.market21Buy ?? s.market24Buy;
      if (price !== null) {
        const timeBucket = Math.floor((s.createdAt - windowStartMs) / bucketSizeMs);
        if (!acc[timeBucket]) acc[timeBucket] = [];
        acc[timeBucket].push(price);
      }
      return acc;
    }, {} as Record<number, number[]>);

    const timeBuckets = Object.keys(snapshotsByTimeBucket).map(Number).sort((a, b) => a - b);
    if (timeBuckets.length < 2) {
      return {
        direction: 'SIDEWAYS',
        confidence: 'LOW',
        horizonMinutes: HORIZON_MINUTES,
        score: 0,
        components: {
          momentum21k: 0,
          varianceDelta: 0,
          fxDelta: 0,
          ounceDelta: 0,
        },
        reasons: ['Insufficient time buckets for trend analysis'],
        snapshotCount: snapshotsToUse.length,
        insufficientData: true,
      };
    }

    // Get first and last buckets (approximately start and end of window)
    const firstBucket = timeBuckets[0];
    const lastBucket = timeBuckets[timeBuckets.length - 1];
    
    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    const startPrice = median(snapshotsByTimeBucket[firstBucket]);
    const endPrice = median(snapshotsByTimeBucket[lastBucket]);

    // Component 1: 21k momentum (% change)
    const momentum21k = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

    // Component 2 & 3: Calculate variance and FX at start and end
    // Use global gold spot price from GoldAPI.com (USD per troy ounce)
    const startOunce = goldSpotData.length > 0 ? goldSpotData[0].xau_spot_usd_oz : null;
    const endOunce = goldSpotData.length > 0 ? goldSpotData[goldSpotData.length - 1].xau_spot_usd_oz : null;

    let startVariance: number | null = null;
    let endVariance: number | null = null;
    let startFX: number | null = null;
    let endFX: number | null = null;

    if (startOunce && endOunce) {
      try {
        // Get snapshots from first and last time buckets (using same bucket size as above)
        const bucketSizeMs = snapshots.length > 500 
          ? 60 * 60 * 1000
          : snapshots.length > 200
          ? 30 * 60 * 1000
          : 5 * 60 * 1000;
        
        const startBucketSnapshots = snapshots.filter(s => {
          const timeBucket = Math.floor((s.createdAt - windowStartMs) / bucketSizeMs);
          return timeBucket === firstBucket;
        });
        const endBucketSnapshots = snapshots.filter(s => {
          const timeBucket = Math.floor((s.createdAt - windowStartMs) / bucketSizeMs);
          return timeBucket === lastBucket;
        });
        
        // Get median sell prices for start/end
        const startSellPrice = median(startBucketSnapshots.map(s => s.market21Sell).filter((p): p is number => p !== null));
        const endSellPrice = median(endBucketSnapshots.map(s => s.market21Sell).filter((p): p is number => p !== null));
        
        if (startSellPrice !== null && endSellPrice !== null) {
          const startPricing = calculatePricing({
            impliedOunceUsd: startOunce,
            market21Buy: startPrice,
            market21Sell: startSellPrice,
            market24Buy: null,
            market24Sell: null,
            usdLocalRate: null, // Forecast uses implied FX (computed from gold prices), not real FX
          });
          const endPricing = calculatePricing({
            impliedOunceUsd: endOunce,
            market21Buy: endPrice,
            market21Sell: endSellPrice,
            market24Buy: null,
            market24Sell: null,
            usdLocalRate: null, // Forecast uses implied FX (computed from gold prices), not real FX
          });

          startVariance = startPricing.variance.variancePct;
          endVariance = endPricing.variance.variancePct;
          // For forecast, we need implied FX (from gold prices), not real FX rate
          // Calculate implied FX from gold prices if available
          startFX = startPrice !== null && startPricing.usdPerGram21 !== null && startPricing.usdPerGram21 > 0
            ? startPrice / startPricing.usdPerGram21
            : null;
          endFX = endPrice !== null && endPricing.usdPerGram21 !== null && endPricing.usdPerGram21 > 0
            ? endPrice / endPricing.usdPerGram21
            : null;
        }
      } catch (error) {
        // Pricing calculation failed, continue with nulls
      }
    }

    // Component 2: Variance delta
    const varianceDelta = startVariance !== null && endVariance !== null ? endVariance - startVariance : 0;

    // Component 3: FX delta (% change)
    const fxDelta = startFX !== null && startFX > 0 && endFX !== null
      ? ((endFX - startFX) / startFX) * 100
      : 0;

    // Component 4: Global gold price delta (% change)
    // Uses true global gold spot price from GoldAPI.com (USD per troy ounce)
    const ounceDelta = startOunce !== null && startOunce > 0 && endOunce !== null
      ? ((endOunce - startOunce) / startOunce) * 100
      : 0;

    // Calculate weighted score (normalize components to -100..+100 range)
    // With longer historical data, we weight recent trends more heavily
    // Momentum: weight 50% (recent price movements are most important)
    // Variance: weight 20% (market premium changes)
    // FX: weight 15% (currency movements)
    // Ounce: weight 15% (global gold price movements)

    const momentumScore = Math.max(-50, Math.min(50, momentum21k * 0.5));
    const varianceScore = Math.max(-20, Math.min(20, varianceDelta * 4)); // Scale: ±5% → ±20
    const fxScore = Math.max(-15, Math.min(15, fxDelta * 3)); // Scale: ±5% → ±15
    const ounceScore = Math.max(-15, Math.min(15, ounceDelta * 3)); // Scale: ±5% → ±15

    const score = momentumScore + varianceScore + fxScore + ounceScore;

    // Determine direction
    let direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    if (score >= 25) {
      direction = 'UP';
    } else if (score <= -25) {
      direction = 'DOWN';
    } else {
      direction = 'SIDEWAYS';
    }

    // Determine confidence
    let confidence: 'LOW' | 'MED' | 'HIGH';
    
    // Check if signals agree (all components point in same direction)
    const signals = [momentumScore, varianceScore, fxScore, ounceScore].filter(s => Math.abs(s) > 5);
    const positiveSignals = signals.filter(s => s > 0).length;
    const negativeSignals = signals.filter(s => s < 0).length;
    const signalsAgree = signals.length >= 3 && (positiveSignals >= 3 || negativeSignals >= 3);

    if (snapshotCount >= HIGH_CONFIDENCE_THRESHOLD && signalsAgree) {
      confidence = 'HIGH';
    } else if (snapshotCount >= LOW_CONFIDENCE_THRESHOLD) {
      confidence = 'MED';
    } else {
      confidence = 'LOW';
    }

    // Generate reasons
    const reasons: string[] = [];
    
    // Calculate time span for display
    const windowHours = FORECAST_WINDOW_MS / (60 * 60 * 1000);
    const windowDesc = windowHours >= 24 ? `${(windowHours / 24).toFixed(1)} days` : `${windowHours.toFixed(1)} hours`;
    
    if (Math.abs(momentumScore) > 5) {
      const trend = momentum21k > 0 ? 'up' : 'down';
      reasons.push(`21k price moved ${Math.abs(momentum21k).toFixed(2)}% ${trend} over ${windowDesc}`);
    }
    
    if (Math.abs(varianceScore) > 5) {
      const trend = varianceDelta > 0 ? 'wider premium' : 'narrower premium';
      reasons.push(`Market premium changed by ${varianceDelta.toFixed(2)}% (${trend})`);
    }
    
    if (Math.abs(fxScore) > 5) {
      const trend = fxDelta > 0 ? 'stronger' : 'weaker';
      reasons.push(`Implied Gold FX moved ${Math.abs(fxDelta).toFixed(2)}% ${trend}`);
    }
    
    if (Math.abs(ounceScore) > 5) {
      const trend = ounceDelta > 0 ? 'higher' : 'lower';
      reasons.push(`Global gold price moved ${Math.abs(ounceDelta).toFixed(2)}% ${trend}`);
    }

    // Add confidence reason
    if (confidence === 'HIGH') {
      reasons.push(`High confidence based on ${snapshotCount} data points over ${windowDesc} with aligned signals`);
    } else if (confidence === 'MED') {
      reasons.push(`Medium confidence based on ${snapshotCount} data points over ${windowDesc}`);
    } else {
      reasons.push(`Low confidence due to limited data (${snapshotCount} snapshots over ${windowDesc})`);
    }

    // Limit to top 3 reasons
    const topReasons = reasons.slice(0, 3);

    return {
      direction,
      confidence,
      horizonMinutes: HORIZON_MINUTES,
      score: Math.round(score),
      components: {
        momentum21k: Math.round(momentum21k * 100) / 100,
        varianceDelta: Math.round(varianceDelta * 100) / 100,
        fxDelta: Math.round(fxDelta * 100) / 100,
        ounceDelta: Math.round(ounceDelta * 100) / 100,
      },
      reasons: topReasons,
      snapshotCount,
      insufficientData: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      direction: 'SIDEWAYS',
      confidence: 'LOW',
      horizonMinutes: HORIZON_MINUTES,
      score: 0,
      components: {
        momentum21k: 0,
        varianceDelta: 0,
        fxDelta: 0,
        ounceDelta: 0,
      },
      reasons: [`Forecast calculation error: ${errorMessage}`],
      snapshotCount: 0,
      insufficientData: true,
    };
  }
}

