/**
 * Supabase Query Helpers - Normalized Schema
 * 
 * Helper functions for querying the normalized market_snapshots_norm schema
 * Schema: id, country, market, karat, price, currency, source, trusted, created_at, raw_hash
 */

import db from '../supabase';
import { Currency } from '../fx-multi';

export interface MarketPrices {
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
 * Get median market prices by karat from normalized schema
 */
export async function getMarketMedians(
  country: 'EG' | 'AE' | 'SA' | 'US',
  trustedMode: boolean = false,
  windowMinutes: number = 60
): Promise<{
  prices: MarketPrices;
  activeSourceCount: number;
  sourcesUsed: Record<string, string[]>;
  lastUpdated: number;
  canonicalCurrency: Currency;
}> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  // Query normalized schema
  let query = supabase
    .from('market_snapshots_norm')
    .select('source, karat, price, currency, created_at')
    .eq('country', country)
    .eq('market', 'local')
    .gte('created_at', windowStart)
    .in('karat', [14, 18, 21, 24]);

  if (trustedMode) {
    query = query.eq('trusted', true);
  }

  // Filter by source for local market sources (only for EG currently)
  if (country === 'EG') {
    query = query.in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getMarketMedians] Query error:', error);
  }

  const dataToUse = data || [];
  
  if (dataToUse.length === 0) {
    console.log('[getMarketMedians] No data found:', { 
      country,
      error: error?.message, 
      count: 0,
      windowStart,
      windowMinutes
    });
    
    // Return default currency for country
    const canonicalCurrency = country === 'EG' ? 'EGP' : 
                              country === 'AE' ? 'AED' :
                              country === 'SA' ? 'SAR' : 'USD';
    
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
      canonicalCurrency,
    };
  }

  console.log(`[getMarketMedians] Found ${dataToUse.length} rows for country ${country}`);

  // Get canonical currency (first row's currency)
  const canonicalCurrency = (dataToUse[0]?.currency || 
    (country === 'EG' ? 'EGP' : country === 'AE' ? 'AED' : country === 'SA' ? 'SAR' : 'USD')) as Currency;

  const prices: MarketPrices = {
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

  // Calculate median for each karat
  const karatConfigs = [
    { karat: 21, buyKey: 'market21Buy' as const, sellKey: 'market21Sell' as const },
    { karat: 24, buyKey: 'market24Buy' as const, sellKey: 'market24Sell' as const },
    { karat: 18, buyKey: 'market18Buy' as const, sellKey: 'market18Sell' as const },
    { karat: 14, buyKey: 'market14Buy' as const, sellKey: 'market14Sell' as const },
  ];

  for (const { karat, buyKey, sellKey } of karatConfigs) {
    // Filter rows for this karat with valid prices
    const validRows = dataToUse.filter((row: any) => {
      return row.karat === karat && 
             row.price !== null && 
             row.price !== undefined && 
             isFinite(Number(row.price)) && 
             Number(row.price) > 0;
    });

    // Check for aggregated source first
    const aggregatedRow = validRows.find((r: any) => r.source === 'aggregated');
    if (aggregatedRow) {
      const price = Number(aggregatedRow.price);
      if (isFinite(price) && price > 0) {
        prices[buyKey] = price;
        prices[sellKey] = null; // Normalized schema only stores buy prices currently
        
        const allSources = Array.from(new Set(validRows.map((r: any) => r.source as string)));
        sourcesUsed[karat.toString()] = allSources.filter(s => s !== 'aggregated');
        allSources.forEach(s => contributingSources.add(s));
        
        const createdAt = typeof aggregatedRow.created_at === 'string' 
          ? new Date(aggregatedRow.created_at).getTime()
          : (typeof aggregatedRow.created_at === 'number' ? aggregatedRow.created_at : 0);
        maxTimestamp = Math.max(maxTimestamp, createdAt);
        
        console.log(`[getMarketMedians] Using aggregated price for ${karat}K:`, price);
        continue;
      }
    }

    // Compute median from individual sources
    if (validRows.length > 0) {
      const buyPrices: number[] = validRows
        .map((row: any) => Number(row.price))
        .filter((price): price is number => isFinite(price) && price > 0)
        .sort((a, b) => a - b);
      
      const mid = Math.floor(buyPrices.length / 2);
      const medianBuy = buyPrices.length % 2 === 0
        ? (buyPrices[mid - 1] + buyPrices[mid]) / 2
        : buyPrices[mid];

      prices[buyKey] = medianBuy;
      prices[sellKey] = null; // No sell prices in normalized schema yet

      const karatSources = Array.from(new Set(validRows.map((r: any) => r.source as string)));
      sourcesUsed[karat.toString()] = karatSources;
      karatSources.forEach(s => contributingSources.add(s));

      const timestamps = validRows.map((row: any) => {
        const ts = row.created_at;
        return typeof ts === 'string' ? new Date(ts).getTime() : (typeof ts === 'number' ? ts : 0);
      });
      if (timestamps.length > 0) {
        maxTimestamp = Math.max(maxTimestamp, ...timestamps);
      }
    }
  }

  console.log('[getMarketMedians] Result:', { 
    country,
    activeSourceCount: contributingSources.size, 
    lastUpdated: maxTimestamp,
    has21k: prices.market21Buy !== null,
    has24k: prices.market24Buy !== null,
    canonicalCurrency,
  });

  return {
    prices,
    activeSourceCount: contributingSources.size,
    sourcesUsed,
    lastUpdated: maxTimestamp,
    canonicalCurrency,
  };
}

/**
 * Get active source count for a country
 */
export async function getActiveSourceCountNorm(
  country: 'EG' | 'AE' | 'SA' | 'US',
  trustedMode: boolean = false,
  windowMinutes: number = 30
): Promise<number> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  
  let query = supabase
    .from('market_snapshots_norm')
    .select('source')
    .eq('country', country)
    .eq('market', 'local')
    .gte('created_at', windowStart)
    .in('karat', [21, 24]);

  if (trustedMode) {
    query = query.eq('trusted', true);
  }

  if (country === 'EG') {
    query = query.in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return 0;
  }

  const validSources = new Set<string>();
  for (const row of data) {
    if (row.source) {
      validSources.add(row.source as string);
    }
  }

  return validSources.size;
}

/**
 * Get time-series data for market prices
 */
export async function getMarketSeries(
  country: 'EG' | 'AE' | 'SA' | 'US',
  windowMinutes: number,
  karat: number = 21
): Promise<Array<{ t: number; v: number }>> {
  const supabase = db.supabase;
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  let query = supabase
    .from('market_snapshots_norm')
    .select('karat, price, created_at, source')
    .eq('country', country)
    .eq('market', 'local')
    .eq('karat', karat)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  if (country === 'EG') {
    query = query.in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return [];
  }

  // Group by 10-second buckets (same as forecast)
  const timeBuckets = new Map<number, number[]>();
  
  for (const row of data) {
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

  // Calculate median per bucket
  const points: Array<{ t: number; v: number }> = [];
  for (const [bucketKey, prices] of timeBuckets.entries()) {
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

