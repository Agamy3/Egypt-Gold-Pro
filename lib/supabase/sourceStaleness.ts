/**
 * Supabase Source Staleness Helper
 * 
 * Manages source staleness tracking in Supabase (replaces SQLite source_staleness table)
 * Uses SQLite schema column names: lastOkTimestamp (bigint), lastOkBuy
 */

import 'server-only';
import db from '../supabase';

type Karat = 14 | 18 | 21 | 24;

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
 * Update staleness for a source+karat combination
 * Includes retry logic for network failures
 */
export async function updateSourceStaleness(
  source: string,
  karat: Karat,
  lastOkTimestampMs: number,
  lastOkBuy: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await retrySupabaseOperation(async () => {
      const result = await db.supabase
        .from('source_staleness')
        .upsert(
          {
            source,
            karat,
            lastOkTimestamp: lastOkTimestampMs, // Use bigint (epoch ms) to match SQLite schema
            lastOkBuy: lastOkBuy,
          },
          {
            onConflict: 'source,karat',
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
 * Check if source+karat is stale
 */
export async function isSourceStale(
  source: string,
  karat: Karat,
  staleAfterMs: number = 30 * 60 * 1000
): Promise<boolean> {
  try {
    const { data, error } = await db.supabase
      .from('source_staleness')
      .select('lastOkTimestamp')
      .eq('source', source)
      .eq('karat', karat)
      .maybeSingle();

    if (error || !data) {
      return true; // Never seen before = stale
    }

    const lastOkTimestamp = data.lastOkTimestamp as number; // Already in epoch ms
    const age = Date.now() - lastOkTimestamp;
    return age > staleAfterMs;
  } catch (error) {
    console.error('[Supabase] Error checking source staleness:', error);
    return true; // On error, assume stale
  }
}

/**
 * Get last valid buy price for source+karat
 */
export async function getLastOkBuy(
  source: string,
  karat: Karat
): Promise<number | null> {
  try {
    const { data, error } = await db.supabase
      .from('source_staleness')
      .select('lastOkBuy')
      .eq('source', source)
      .eq('karat', karat)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.lastOkBuy as number;
  } catch (error) {
    console.error('[Supabase] Error getting last ok buy:', error);
    return null;
  }
}

