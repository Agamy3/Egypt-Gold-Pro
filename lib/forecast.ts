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
 */
export async function calculateForecast(trustedMode: boolean = false): Promise<ForecastResult> {
  const now = Date.now();
  const windowStart = now - FORECAST_WINDOW_MS;

  try {
    // Get snapshots from Supabase (wide schema)
    // Filter by trusted source if trusted-only mode is enabled
    const isTrustedMode = trustedMode || getTrustedModeFromEnv();
    // IMPORTANT: Only use local market sources (aggregated and individual sources)
    let snapshotQuery = db.supabase
      .from('market_snapshots')
      .select('source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, error')
      .gte('createdAt', windowStart) // createdAt is bigint, use epoch ms number
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
      .or('market21Buy.not.is.null,market24Buy.not.is.null');

    // For trusted mode, filter by source (goldbullioneg is trusted)
    if (isTrustedMode) {
      snapshotQuery = snapshotQuery.eq('source', 'goldbullioneg');
    }

    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;

    // Transform to snapshot format (group by time bucket - rounded to nearest minute)
    // This ensures that multiple snapshots ingested at slightly different times are grouped together
    const snapshotsByTime = new Map<number, {
      createdAt: number;
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
      source: string;
    }>();

    if (!snapshotError && snapshotRows) {
      for (const row of snapshotRows) {
        const market21Buy = row.market21Buy as number | null;
        const market24Buy = row.market24Buy as number | null;
        
        // Skip if no valid prices
        if ((market21Buy === null || !isFinite(market21Buy) || market21Buy <= 0) &&
            (market24Buy === null || !isFinite(market24Buy) || market24Buy <= 0)) {
          continue;
        }

        // createdAt is stored as bigint (epoch ms number) in Supabase
        const createdAt = typeof row.createdAt === 'number' ? row.createdAt : (typeof row.createdAt === 'string' ? new Date(row.createdAt).getTime() : 0);
        // Round to nearest minute (60000 ms) for grouping
        const timeBucket = Math.floor(createdAt / 60000) * 60000;
        
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
        
        // Set prices from wide schema (average if multiple values in same bucket)
        if (market21Buy !== null && isFinite(market21Buy) && market21Buy > 0) {
          if (snapshot.market21Buy === null) {
            snapshot.market21Buy = market21Buy;
          } else {
            snapshot.market21Buy = (snapshot.market21Buy + market21Buy) / 2;
          }
        }
        
        if (market24Buy !== null && isFinite(market24Buy) && market24Buy > 0) {
          if (snapshot.market24Buy === null) {
            snapshot.market24Buy = market24Buy;
          } else {
            snapshot.market24Buy = (snapshot.market24Buy + market24Buy) / 2;
          }
        }
      }
    }

    const snapshots = Array.from(snapshotsByTime.values()).sort((a, b) => a.createdAt - b.createdAt);

    // Filter out snapshots that don't have at least one price (21k or 24k)
    const validSnapshots = snapshots.filter(s => s.market21Buy !== null || s.market24Buy !== null);

    // Get global gold spot price data from Supabase
    const goldSpotData = await getGoldSpotHistory(windowStart);

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
        const timeBucket = Math.floor((s.createdAt - windowStart) / bucketSizeMs);
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
          const timeBucket = Math.floor((s.createdAt - windowStart) / bucketSizeMs);
          return timeBucket === firstBucket;
        });
        const endBucketSnapshots = snapshots.filter(s => {
          const timeBucket = Math.floor((s.createdAt - windowStart) / bucketSizeMs);
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
          });
          const endPricing = calculatePricing({
            impliedOunceUsd: endOunce,
            market21Buy: endPrice,
            market21Sell: endSellPrice,
            market24Buy: null,
            market24Sell: null,
          });

          startVariance = startPricing.variance.variancePct;
          endVariance = endPricing.variance.variancePct;
          startFX = startPricing.usdEgpGold;
          endFX = endPricing.usdEgpGold;
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

