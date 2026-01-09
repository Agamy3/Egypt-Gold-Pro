/**
 * Supabase Source Staleness Helper
 * 
 * Manages source staleness tracking in Supabase (replaces SQLite source_staleness table)
 * Uses SQLite schema column names: lastOkTimestamp (bigint), lastOkBuy
 */

import 'server-only';
import db from '../supabase';

type Karat = 14 | 18 | 21 | 22 | 24;

/**
 * Helper to retry a Supabase operation with exponential backoff
 */
async function retrySupabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isNetworkError = 
        error instanceof Error && (
          error.message.includes('fetch failed') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('SocketError') ||
          error.message.includes('UND_ERR_SOCKET')
        );
      
      if (!isNetworkError || attempt === maxRetries - 1) {
        throw error; // Don't retry non-network errors or if last attempt
      }
      
      // Exponential backoff: 0.5s, 1s
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Update staleness for a source+karat combination (with country support)
 * Includes retry logic for network failures
 */
export async function updateSourceStaleness(
  country: 'EG' | 'AE' | 'SA' | 'US',
  source: string,
  karat: Karat,
  lastOkTimestampMs: number,
  lastOkBuy: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await retrySupabaseOperation(async () => {
      // Convert epoch ms to timestamptz ISO string
      const lastOkTimestampISO = new Date(lastOkTimestampMs).toISOString();
      
      const result = await db.supabase
        .from('source_staleness')
        .upsert(
          {
            country,
            source,
            karat,
            last_ok_timestamp: lastOkTimestampISO, // Use timestamptz (ISO string)
            last_ok_price: lastOkBuy,
          },
          {
            onConflict: 'country,source,karat',
          }
        );
      // Check for network errors and throw to trigger retry
      if (result.error) {
        const errorMsg = result.error.message || String(result.error);
        const isNetworkError = 
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('SocketError') ||
          errorMsg.includes('UND_ERR_SOCKET') ||
          result.error.details?.includes('fetch failed') ||
          result.error.details?.includes('ECONNRESET');
        
        if (isNetworkError) {
          throw new Error(errorMsg);
        }
      }
      return result;
    });

    if (error) {
      console.error('[Supabase] Error updating source staleness:', error);
      return { ok: false, error: error.message || error.details || String(error) };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Supabase] Exception updating source staleness:', errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/**
 * Check if source+karat is stale (with country support)
 */
export async function isSourceStale(
  country: 'EG' | 'AE' | 'SA' | 'US',
  source: string,
  karat: Karat,
  staleAfterMs: number = 30 * 60 * 1000
): Promise<boolean> {
  try {
    const { data, error } = await db.supabase
      .from('source_staleness')
      .select('last_ok_timestamp')
      .eq('country', country)
      .eq('source', source)
      .eq('karat', karat)
      .maybeSingle();

    if (error || !data) {
      return true; // Never seen before = stale
    }

    // Convert timestamptz to epoch ms
    const lastOkTimestamp = typeof data.last_ok_timestamp === 'string'
      ? new Date(data.last_ok_timestamp).getTime()
      : (typeof data.last_ok_timestamp === 'number' ? data.last_ok_timestamp : 0);
    const age = Date.now() - lastOkTimestamp;
    return age > staleAfterMs;
  } catch (error) {
    console.error('[Supabase] Error checking source staleness:', error);
    return true; // On error, assume stale
  }
}

/**
 * Get last valid buy price for source+karat (with country support)
 */
export async function getLastOkBuy(
  country: 'EG' | 'AE' | 'SA' | 'US',
  source: string,
  karat: Karat
): Promise<number | null> {
  try {
    const { data, error } = await db.supabase
      .from('source_staleness')
      .select('last_ok_price')
      .eq('country', country)
      .eq('source', source)
      .eq('karat', karat)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return Number(data.last_ok_price);
  } catch (error) {
    console.error('[Supabase] Error getting last ok buy:', error);
    return null;
  }
}

