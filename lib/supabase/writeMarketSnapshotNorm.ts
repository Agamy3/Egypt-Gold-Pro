/**
 * Write Market Snapshot to Normalized Schema (Server-Only)
 * 
 * Writes normalized rows to Supabase market_snapshots_norm table
 * One row per karat with country and currency support
 */

import 'server-only';
import db from '../supabase';
import { getCountryCurrency } from '../fx-multi';

interface PriceData {
  buy?: number | null;
  sell?: number | null;
}

interface WriteMarketSnapshotNormParams {
  country: 'EG' | 'AE' | 'SA' | 'US';
  source: string;
  trusted: boolean;
  createdAt: number; // epoch milliseconds
  rawHash?: string | null;
  prices: {
    14?: PriceData;
    18?: PriceData;
    21?: PriceData;
    22?: PriceData; // Optional - skip if schema doesn't support it
    24?: PriceData;
  };
}

interface WriteResult {
  ok: boolean;
  inserted?: number;
  error?: string;
}

/**
 * Helper to retry a Supabase operation with exponential backoff
 */
async function retrySupabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
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
        throw error;
      }
      
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[Supabase] Network error on attempt ${attempt + 1}/${maxRetries}, retrying in ${delayMs}ms:`, error instanceof Error ? error.message : String(error));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Write market snapshot to normalized schema
 * Creates multiple rows (one per karat) in market_snapshots_norm
 */
export async function writeMarketSnapshotNorm(
  params: WriteMarketSnapshotNormParams
): Promise<WriteResult> {
  try {
    const supabase = db.supabase;
    const currency = getCountryCurrency(params.country);
    const createdAtISO = new Date(params.createdAt).toISOString();
    
    // Build rows: one per karat with valid buy price
    // Note: market_snapshots_norm table does NOT have a 'market' column - only country, karat, price, currency, source, trusted, created_at, raw_hash
    const rows: Array<{
      country: string;
      karat: number;
      price: number;
      currency: string;
      source: string;
      trusted: boolean;
      created_at: string;
      raw_hash: string | null;
    }> = [];

    // Only include karats that exist in schema constraint
    // Skip 22k for now - schema constraint may not include it yet
    const karats: (14 | 18 | 21 | 24)[] = [14, 18, 21, 24];
    for (const karat of karats) {
      const priceData = params.prices[karat as keyof typeof params.prices];
      const buyPrice = priceData?.buy;
      
      if (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) {
        rows.push({
          country: params.country,
          karat,
          price: buyPrice,
          currency,
          source: params.source,
          trusted: params.trusted,
          created_at: createdAtISO,
          raw_hash: params.rawHash || null,
        });
      }
    }

    if (rows.length === 0) {
      return { ok: true, inserted: 0 };
    }

    console.log('[Supabase] Writing normalized snapshot:', { 
      country: params.country, 
      source: params.source, 
      karats: rows.map(r => r.karat),
      createdAt: createdAtISO 
    });
    
    try {
      const { error, data: inserted } = await retrySupabaseOperation(async () => {
        const result = await supabase
          .from('market_snapshots_norm')
          .insert(rows)
          .select('id');
        
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
        console.error('[Supabase] Write error:', error, 'Rows attempted:', rows.length);
        return {
          ok: false,
          inserted: 0,
          error: error.message || error.details || String(error),
        };
      }

      console.log('[Supabase] Successfully inserted normalized snapshot:', { 
        id: inserted?.[0]?.id, 
        country: params.country,
        source: params.source,
        rowsInserted: inserted?.length || rows.length
      });

      return {
        ok: true,
        inserted: inserted?.length || rows.length,
      };
    } catch (networkError) {
      const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
      console.error('[Supabase] Network error after retries:', errorMessage);
      return {
        ok: false,
        inserted: 0,
        error: `Network error: ${errorMessage}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Supabase] Write exception:', errorMessage, errorStack);
    return {
      ok: false,
      inserted: 0,
      error: errorMessage,
    };
  }
}

