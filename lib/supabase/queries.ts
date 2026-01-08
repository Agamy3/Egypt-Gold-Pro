/**
 * Supabase Query Helpers
 * 
 * Helper functions for querying the normalized market_snapshots schema
 * New schema: market, karat, price_egp, source, trusted, created_at, raw_hash
 */

import db from '../supabase';

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
 * Uses SQLite-compatible schema: market_snapshots with camelCase columns (createdAt, market21Buy, etc.)
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
  const windowStart = Date.now() - windowMs; // Use bigint (epoch ms) for comparison

  // Query using SQLite-compatible schema: camelCase columns
  // Supabase PostgREST: for quoted identifiers in schema, access without quotes in JS client
  // Schema has "createdAt" (quoted in SQL) but we access as createdAt (no quotes) in JS
  let query = supabase
    .from('market_snapshots')
    .select('source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, market18Buy, market18Sell, market14Buy, market14Sell, error')
    .gte('createdAt', windowStart)
    .is('error', null);

  // For trusted mode, filter by source (goldbullioneg is trusted)
  if (trustedMode) {
    query = query.eq('source', 'goldbullioneg');
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
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

  // Group by karat and calculate median from camelCase columns
  const karats = [
    { karat: 21, buyKey: 'market21Buy', sellKey: 'market21Sell' },
    { karat: 24, buyKey: 'market24Buy', sellKey: 'market24Sell' },
    { karat: 18, buyKey: 'market18Buy', sellKey: 'market18Sell' },
    { karat: 14, buyKey: 'market14Buy', sellKey: 'market14Sell' },
  ];

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

  for (const { karat, buyKey, sellKey } of karats) {
    // Filter rows that have non-null buy price for this karat
    const karatRows = data.filter((row: any) => {
      const buyPrice = row[buyKey];
      return buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0;
    });
    
    if (karatRows.length > 0) {
      // Calculate median buy price
      const buyPrices = karatRows.map((row: any) => row[buyKey] as number).sort((a, b) => a - b);
      const mid = Math.floor(buyPrices.length / 2);
      const medianBuy = buyPrices.length % 2 === 0
        ? (buyPrices[mid - 1] + buyPrices[mid]) / 2
        : buyPrices[mid];

      // Calculate median sell price (if available)
      const sellPrices = karatRows
        .map((row: any) => row[sellKey] as number | null)
        .filter((p: number | null) => p !== null && p !== undefined && isFinite(p) && p > 0)
        .sort((a, b) => a - b);
      
      let medianSell: number | null = null;
      if (sellPrices.length > 0) {
        const sellMid = Math.floor(sellPrices.length / 2);
        medianSell = sellPrices.length % 2 === 0
          ? (sellPrices[sellMid - 1] + sellPrices[sellMid]) / 2
          : sellPrices[sellMid];
      }

      // Map to output format
      prices[buyKey as keyof EgyptMarketPrices] = medianBuy;
      prices[sellKey as keyof EgyptMarketPrices] = medianSell;

      // Track contributing sources
      const karatSources = Array.from(new Set(karatRows.map((row: any) => row.source as string)));
      sourcesUsed[karat.toString()] = karatSources;
      karatSources.forEach(s => contributingSources.add(s));

      // Track latest timestamp (createdAt is already in epoch ms)
      const karatTimestamps = karatRows.map((row: any) => row.createdAt as number);
      maxTimestamp = Math.max(maxTimestamp, ...karatTimestamps);
    }
  }

  return {
    prices,
    activeSourceCount: contributingSources.size,
    sourcesUsed,
    lastUpdated: maxTimestamp,
  };
}

/**
 * Get time-series data for Egypt market prices
 * Uses SQLite-compatible schema: market_snapshots with camelCase columns
 * Returns points grouped by time bucket
 */
export async function getEgyptMarketSeries(
  windowMinutes: number,
  trustedMode: boolean = false,
  karat: number = 21
): Promise<Array<{ t: number; v: number }>> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs; // Use bigint (epoch ms) for comparison

  // Determine which karat column to use
  const karatKey = karat === 21 ? 'market21Buy' : karat === 24 ? 'market24Buy' : karat === 18 ? 'market18Buy' : 'market14Buy';

  // Query using SQLite-compatible schema
  // Note: Supabase handles camelCase column names without quotes in query builder
  let query = supabase
    .from('market_snapshots')
    .select(`createdAt, ${karatKey}, error`)
    .gte('createdAt', windowStart) // Remove quotes
    .is('error', null)
    .not(karatKey, 'is', null) // Remove quotes
    .order('createdAt', { ascending: true }); // Remove quotes

  // For trusted mode, filter by source (goldbullioneg is trusted)
  if (trustedMode) {
    query = query.eq('source', 'goldbullioneg');
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return [];
  }

  // Filter valid prices and group by timestamp (per minute) for bucketing
  const timeBuckets = new Map<number, number[]>();
  
  for (const row of data) {
    const price = row[karatKey];
    if (price !== null && price !== undefined && isFinite(price) && price > 0) {
      const timestamp = row.createdAt as number; // Already in epoch ms
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
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
    
    points.push({
      t: bucketKey,
      v: median,
    });
  }

  return points.sort((a, b) => a.t - b.t);
}

/**
 * Get active source count (distinct sources with data in last window)
 * Uses SQLite-compatible schema: market_snapshots with camelCase columns
 */
export async function getActiveSourceCount(
  trustedMode: boolean = false,
  windowMinutes: number = 30
): Promise<number> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs; // Use bigint (epoch ms) for comparison

  // Query using SQLite-compatible schema - check if any karat price is non-null
  let query = supabase
    .from('market_snapshots')
    .select('source, "market21Buy", "market24Buy", "market18Buy", "market14Buy", error')
    .gte('"createdAt"', windowStart)
    .is('error', null);

  // For trusted mode, filter by source (goldbullioneg is trusted)
  if (trustedMode) {
    query = query.eq('source', 'goldbullioneg');
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return 0;
  }

  // Filter rows that have at least one valid price and count distinct sources
  const validSources = new Set<string>();
  for (const row of data) {
    const hasValidPrice = 
      (row.market21Buy !== null && isFinite(row.market21Buy) && row.market21Buy > 0) ||
      (row.market24Buy !== null && isFinite(row.market24Buy) && row.market24Buy > 0) ||
      (row.market18Buy !== null && isFinite(row.market18Buy) && row.market18Buy > 0) ||
      (row.market14Buy !== null && isFinite(row.market14Buy) && row.market14Buy > 0);
    
    if (hasValidPrice) {
      validSources.add(row.source as string);
    }
  }

  return validSources.size;
}
