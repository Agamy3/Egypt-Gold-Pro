/**
 * Egypt Market Implied Ounce Integration
 * 
 * Source: Gold-API.com (XAUUSD prices represent Egypt Market Implied Ounce)
 */

import { fetchImpliedOunce, ImpliedOunceResult } from './implied-ounce';
import { getLatestGoldSpot, insertGoldSpot } from './supabase/goldSpot';

const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache for Gold-API.com

export interface ImpliedOunceData {
  impliedOunceUsd: number;
  source: 'gold-api.com';
  timestamp: number;
  stale: boolean;
}

export interface ImpliedOunceError {
  message: string;
}

/**
 * Get cached Egypt Market Implied Ounce or fetch new if expired
 * Uses fetchImpliedOunce() which fetches from Gold-API.com
 * Returns data and error separately, never throws
 */
export async function getImpliedOunceWithCache(_db?: any): Promise<{
  data: ImpliedOunceData | null;
  error: ImpliedOunceError | null;
}> {
  // Check cache from Supabase
  let cached: { xau_spot_usd_oz: number; source: string; fetched_at: number; stale: boolean } | null = null;
  try {
    const cachedData = await getLatestGoldSpot();
    if (cachedData) {
      cached = {
        xau_spot_usd_oz: cachedData.xau_spot_usd_oz,
        source: cachedData.source,
        fetched_at: cachedData.fetched_at,
        stale: cachedData.stale,
      };
    }
  } catch (error) {
    console.error('[Supabase] Error getting cached gold spot, will fetch new:', error);
  }

  if (cached) {
    const age = Date.now() - cached.fetched_at;
    if (age < CACHE_TTL_MS && !cached.stale) {
      return {
        data: {
          impliedOunceUsd: cached.xau_spot_usd_oz,
          source: 'gold-api.com' as const,
          timestamp: cached.fetched_at,
          stale: false,
        },
        error: null,
      };
    }
  }

  // Fetch new
  const result = await fetchImpliedOunce();
  
  if (result.price !== null && result.source !== null) {
    // Store in Supabase (non-fatal)
    try {
      await insertGoldSpot(result.price, result.source, Date.now(), false);
    } catch (error) {
      console.error('[Supabase] Failed to cache gold spot, continuing:', error);
    }
    
    return {
      data: {
        impliedOunceUsd: result.price,
        source: result.source as 'gold-api.com',
        timestamp: Date.now(),
        stale: false,
      },
      error: null,
    };
  }

  // If fetch failed, return stale data if available
  if (cached) {
    return {
      data: {
        impliedOunceUsd: cached.xau_spot_usd_oz,
        source: 'gold-api.com' as const,
        timestamp: cached.fetched_at,
        stale: true,
      },
      error: result.error ? { message: result.error } : null,
    };
  }

  return {
    data: null,
    error: result.error ? { message: result.error } : null,
  };
}
