/**
 * Supabase Query Helpers
 * 
 * Helper functions for querying the normalized market_snapshots schema
 * New schema: market, karat, price_egp, source, trusted, created_at, raw_hash
 */

import db from '../supabase';

// Normalized table name constant
export const NORMALIZED_SNAPSHOTS_TABLE = 'market_snapshots';

export interface EgyptMarketPrices {
  market21Buy: number | null;
  market21Sell: number | null;
  market24Buy: number | null;
  market24Sell: number | null;
  market18Buy: number | null;
  market18Sell: number | null;
  market14Buy: number | null;
  market14Sell: number | null;
}

/**
 * Get median Egypt market prices by karat from Supabase
 * Uses normalized schema: market_snapshots with columns (market, karat, price_egp, source, trusted, created_at)
 */
export async function getEgyptMarketMedians(
  trustedMode: boolean = false,
  windowMinutes: number = 60
): Promise<{
  prices: EgyptMarketPrices;
  activeSourceCount: number;
  sourcesUsed: Record<string, string[]>;
  lastUpdated: number;
}> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs;
  const windowStartISO = new Date(windowStart).toISOString();

  // Query using normalized schema: market, karat, price_egp, source, trusted, created_at
  let query = supabase
    .from(NORMALIZED_SNAPSHOTS_TABLE)
    .select('karat, price_egp, source, trusted, created_at')
    .eq('market', 'egypt')
    .gte('created_at', windowStartISO);

  // For trusted mode, filter by trusted flag
  if (trustedMode) {
    query = query.eq('trusted', true);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    console.log('[getEgyptMarketMedians] No data found:', { error: error?.message, count: data?.length });
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
        market18Buy: null,
        market18Sell: null,
        market14Buy: null,
        market14Sell: null,
      },
      activeSourceCount: 0,
      sourcesUsed: {},
      lastUpdated: 0,
    };
  }

  // Group by karat and calculate median
  const karats = [14, 18, 21, 24];
  const prices: EgyptMarketPrices = {
    market21Buy: null,
    market21Sell: null,
    market24Buy: null,
    market24Sell: null,
    market18Buy: null,
    market18Sell: null,
    market14Buy: null,
    market14Sell: null,
  };

  const sourcesUsed: Record<string, string[]> = {};
  let maxTimestamp = 0;
  const contributingSources = new Set<string>();

  for (const karat of karats) {
    // Filter rows for this karat with valid prices
    // Ensure karat comparison handles both number and string types from Supabase
    const karatRows = data.filter((row: any) => {
      const rowKarat = typeof row.karat === 'number' ? row.karat : parseInt(String(row.karat), 10);
      return rowKarat === karat && 
             row.price_egp !== null && 
             row.price_egp !== undefined && 
             isFinite(Number(row.price_egp)) && 
             Number(row.price_egp) > 0;
    });
    
    if (karatRows.length > 0) {
      // Calculate median buy price (normalized schema only has buy prices)
      // Filter and map to ensure type safety for sort comparator
      const buyPrices: number[] = karatRows
        .map((row: any) => row.price_egp)
        .filter((price: any): price is number => typeof price === 'number' && isFinite(price) && price > 0)
        .sort((a, b) => a - b);
      
      const mid = Math.floor(buyPrices.length / 2);
      const medianBuy = buyPrices.length % 2 === 0
        ? (buyPrices[mid - 1] + buyPrices[mid]) / 2
        : buyPrices[mid];

      // Map to output format (normalized schema is buy-only, so sell is null)
      const buyKey = `market${karat}Buy` as keyof EgyptMarketPrices;
      const sellKey = `market${karat}Sell` as keyof EgyptMarketPrices;
      prices[buyKey] = medianBuy;
      prices[sellKey] = null; // Normalized schema doesn't store sell prices

      // Track contributing sources
      const karatSources = Array.from(new Set(karatRows.map((row: any) => row.source as string)));
      sourcesUsed[karat.toString()] = karatSources;
      karatSources.forEach(s => contributingSources.add(s));

      // Track latest timestamp (convert ISO string to epoch ms)
      const karatTimestamps = karatRows.map((row: any) => {
        const created_at = row.created_at as string;
        return new Date(created_at).getTime();
      });
      maxTimestamp = Math.max(maxTimestamp, ...karatTimestamps);
    }
  }

  console.log('[getEgyptMarketMedians] Result:', { 
    activeSourceCount: contributingSources.size, 
    lastUpdated: maxTimestamp,
    has21k: prices.market21Buy !== null,
    has24k: prices.market24Buy !== null
  });

  return {
    prices,
    activeSourceCount: contributingSources.size,
    sourcesUsed,
    lastUpdated: maxTimestamp,
  };
}

/**
 * Get time-series data for Egypt market prices
 * Uses normalized schema: market_snapshots with columns (market, karat, price_egp, source, trusted, created_at)
 * Returns points grouped by time bucket
 */
export async function getEgyptMarketSeries(
  windowMinutes: number,
  trustedMode: boolean = false,
  karat: number = 21
): Promise<Array<{ t: number; v: number }>> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs;
  const windowStartISO = new Date(windowStart).toISOString();

  // Query using normalized schema
  let query = supabase
    .from(NORMALIZED_SNAPSHOTS_TABLE)
    .select('karat, price_egp, created_at')
    .eq('market', 'egypt')
    .eq('karat', karat)
    .gte('created_at', windowStartISO)
    .not('price_egp', 'is', null)
    .order('created_at', { ascending: true });

  // For trusted mode, filter by trusted flag
  if (trustedMode) {
    query = query.eq('trusted', true);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return [];
  }

  // Filter valid prices and group by timestamp (per minute) for bucketing
  const timeBuckets = new Map<number, number[]>();
  
  for (const row of data) {
    const price = row.price_egp as number;
    if (price !== null && price !== undefined && isFinite(price) && price > 0) {
      const created_at = row.created_at as string;
      const timestamp = new Date(created_at).getTime(); // Convert ISO to epoch ms
      // Round to nearest minute for bucketing
      const bucketKey = Math.floor(timestamp / 60000) * 60000;
      
      if (!timeBuckets.has(bucketKey)) {
        timeBuckets.set(bucketKey, []);
      }
      timeBuckets.get(bucketKey)!.push(price);
    }
  }

  // Calculate median per bucket and create time series
  const points: Array<{ t: number; v: number }> = [];
  for (const [bucketKey, prices] of timeBuckets.entries()) {
    // Type guard: ensure all prices are valid numbers before sorting
    const validPrices: number[] = prices.filter((p): p is number => typeof p === 'number' && isFinite(p) && p > 0);
    validPrices.sort((a, b) => a - b);
    if (validPrices.length === 0) continue;
    const mid = Math.floor(validPrices.length / 2);
    const median = validPrices.length % 2 === 0
      ? (validPrices[mid - 1] + validPrices[mid]) / 2
      : validPrices[mid];
    
    points.push({
      t: bucketKey,
      v: median,
    });
  }

  return points.sort((a, b) => a.t - b.t);
}

/**
 * Get active source count (distinct sources with data in last window)
 * Uses normalized schema: market_snapshots with columns (market, karat, price_egp, source, trusted, created_at)
 */
export async function getActiveSourceCount(
  trustedMode: boolean = false,
  windowMinutes: number = 30
): Promise<number> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs;
  const windowStartISO = new Date(windowStart).toISOString();

  // Query using normalized schema
  let query = supabase
    .from(NORMALIZED_SNAPSHOTS_TABLE)
    .select('source, trusted, created_at')
    .eq('market', 'egypt')
    .gte('created_at', windowStartISO)
    .not('price_egp', 'is', null);

  // For trusted mode, filter by trusted flag
  if (trustedMode) {
    query = query.eq('trusted', true);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return 0;
  }

  // Count distinct sources
  const validSources = new Set<string>();
  for (const row of data) {
    if (row.source) {
      validSources.add(row.source as string);
    }
  }

  return validSources.size;
}
