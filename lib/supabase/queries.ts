/**
 * Supabase Query Helpers
 * 
 * Helper functions for querying the wide market_snapshots schema
 * Schema: id, source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, 
 *         market18Buy, market18Sell, market14Buy, market14Sell, usdBuy, usdSell, 
 *         rawHash, error, httpStatus, url, rawResponseSnippet
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
 * Uses wide schema: market_snapshots with columns (createdAt, market21Buy, market24Buy, etc.)
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
  // If createdAt is stored as timestamptz, convert to ISO string for comparison
  // If it's bigint (epoch ms), Supabase PostgREST handles number conversion
  const windowStartISO = new Date(windowStart).toISOString();

  // Query using wide schema: createdAt, market21Buy, market24Buy, etc.
  // createdAt is likely stored as timestamptz, so use ISO string for comparison
  // IMPORTANT: Aggregate ALL sources (banklive, gold_era, dokangold, goldrate24, goldbullioneg, aggregated)
  // Exclude 'aggregated' from individual source queries, but include all other sources
  let query = supabase
    .from('market_snapshots')
    .select('source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, market18Buy, market18Sell, market14Buy, market14Sell, error')
    .gte('createdAt', windowStartISO) // Use ISO string for timestamptz comparison
    .is('error', null)
    .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']); // Only use our local market sources

  // For trusted mode, filter by source (goldbullioneg is trusted)
  if (trustedMode) {
    query = query.eq('source', 'goldbullioneg');
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getEgyptMarketMedians] Query error:', error);
    // Try alternative query without error filter to see if there's any data
    const { data: allData, error: allError } = await supabase
      .from('market_snapshots')
      .select('source, createdAt, market21Buy, market24Buy, error')
      .limit(10);
    console.log('[getEgyptMarketMedians] Sample data (without filters):', { count: allData?.length, error: allError?.message, sample: allData?.[0] });
  }

  if (error || !data || data.length === 0) {
    console.log('[getEgyptMarketMedians] No data found:', { 
      error: error?.message, 
      count: data?.length,
      windowStart,
      windowStartISO,
      windowMinutes
    });
    // Try querying without time window to see if there's any data at all
    const { data: anyData } = await supabase
      .from('market_snapshots')
      .select('source, createdAt, market21Buy, market24Buy')
      .limit(5);
    console.log('[getEgyptMarketMedians] Any data in table (no filters):', anyData?.length || 0, 'rows');
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

  // Calculate medians for each karat from wide schema columns
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

  // Calculate median for each karat from wide columns
  const karatConfigs = [
    { karat: 21, buyKey: 'market21Buy', sellKey: 'market21Sell' },
    { karat: 24, buyKey: 'market24Buy', sellKey: 'market24Sell' },
    { karat: 18, buyKey: 'market18Buy', sellKey: 'market18Sell' },
    { karat: 14, buyKey: 'market14Buy', sellKey: 'market14Sell' },
  ];

  for (const { karat, buyKey, sellKey } of karatConfigs) {
    // Filter rows that have valid buy price for this karat
    const validRows = data.filter((row: any) => {
      const buyPrice = row[buyKey];
      return buyPrice !== null && 
             buyPrice !== undefined && 
             isFinite(Number(buyPrice)) && 
             Number(buyPrice) > 0;
    });

    if (validRows.length > 0) {
      // Calculate median buy price with type safety
      const buyPrices: number[] = validRows
        .map((row: any) => Number(row[buyKey]))
        .filter((price): price is number => isFinite(price) && price > 0)
        .sort((a, b) => a - b);
      
      const mid = Math.floor(buyPrices.length / 2);
      const medianBuy = buyPrices.length % 2 === 0
        ? (buyPrices[mid - 1] + buyPrices[mid]) / 2
        : buyPrices[mid];

      // Calculate median sell price if available
      const sellPrices: number[] = validRows
        .map((row: any) => row[sellKey])
        .filter((price: any): price is number => 
          price !== null && price !== undefined && isFinite(Number(price)) && Number(price) > 0
        )
        .map(Number)
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
      const karatSources = Array.from(new Set(validRows.map((row: any) => row.source as string)));
      sourcesUsed[karat.toString()] = karatSources;
      karatSources.forEach(s => contributingSources.add(s));

      // Track latest timestamp (createdAt might be ISO string or number)
      const timestamps = validRows.map((row: any) => {
        const ts = row.createdAt;
        // If it's a string (ISO), convert to epoch ms
        if (typeof ts === 'string') {
          return new Date(ts).getTime();
        }
        // If it's already a number (epoch ms), use it directly
        return typeof ts === 'number' ? ts : 0;
      });
      if (timestamps.length > 0) {
        maxTimestamp = Math.max(maxTimestamp, ...timestamps);
      }
    }
  }

  console.log('[getEgyptMarketMedians] Result:', { 
    activeSourceCount: contributingSources.size, 
    lastUpdated: maxTimestamp,
    has21k: prices.market21Buy !== null,
    has24k: prices.market24Buy !== null,
    totalRows: data.length
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
 * Uses wide schema: market_snapshots with columns (createdAt, market21Buy, market24Buy, etc.)
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

  // Determine which column to use based on karat
  const karatKey = karat === 21 ? 'market21Buy' : karat === 24 ? 'market24Buy' : karat === 18 ? 'market18Buy' : 'market14Buy';

  // Query using wide schema (createdAt is timestamptz, use ISO string for comparison)
  // IMPORTANT: Only use our local market sources (exclude old sources)
  let query = supabase
    .from('market_snapshots')
    .select(`createdAt, ${karatKey}, error, source`)
    .gte('createdAt', windowStartISO)
    .is('error', null)
    .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
    .not(karatKey, 'is', null)
    .order('createdAt', { ascending: true });

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
      const price = (row as any)[karatKey] as number;
      if (price !== null && price !== undefined && isFinite(Number(price)) && Number(price) > 0) {
        // createdAt might be ISO string or number (epoch ms)
        const createdAtRaw = row.createdAt;
        const createdAt = typeof createdAtRaw === 'string' 
          ? new Date(createdAtRaw).getTime() 
          : (typeof createdAtRaw === 'number' ? createdAtRaw : 0);
        // Round to nearest minute for bucketing
        const bucketKey = Math.floor(createdAt / 60000) * 60000;
      
      if (!timeBuckets.has(bucketKey)) {
        timeBuckets.set(bucketKey, []);
      }
      timeBuckets.get(bucketKey)!.push(Number(price));
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
 * Uses wide schema: market_snapshots with columns (createdAt, source, market21Buy, market24Buy, etc.)
 */
export async function getActiveSourceCount(
  trustedMode: boolean = false,
  windowMinutes: number = 30
): Promise<number> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Date.now() - windowMs;
  const windowStartISO = new Date(windowStart).toISOString();

  // Query using wide schema - count sources with valid prices (createdAt is timestamptz, use ISO string)
  // IMPORTANT: Only count our local market sources (exclude old sources like isagha, goldbillion)
  let query = supabase
    .from('market_snapshots')
    .select('source, createdAt, market21Buy, market24Buy, error')
    .gte('createdAt', windowStartISO)
    .is('error', null)
    .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
    .or('market21Buy.not.is.null,market24Buy.not.is.null');

  // For trusted mode, filter by source (goldbullioneg is trusted)
  if (trustedMode) {
    query = query.eq('source', 'goldbullioneg');
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
