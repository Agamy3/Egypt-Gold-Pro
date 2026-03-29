/**
 * Write Egypt Market Snapshot to Supabase (Server-Only)
 * 
 * Writes ONE wide row to Supabase market_snapshots table
 * Uses wide schema: createdAt, market21Buy, market24Buy, etc.
 */

import 'server-only';
import db from '../supabase';

interface PriceData {
  buy?: number | null;
  sell?: number | null;
}

interface WriteEgyptSnapshotParams {
  source: string;
  trusted: boolean;
  createdAtMs: number;
  rawHash?: string | null;
  ingestionRunId?: string | null;
  isDegraded?: boolean;
  sourceWriteCount?: number | null;
  freshSourceCount?: number | null;
  degradedReason?: string | null;
  prices: {
    14?: PriceData;
    18?: PriceData;
    21?: PriceData;
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
  let lastError: unknown;
  
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
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[Supabase] Network error on attempt ${attempt + 1}/${maxRetries}, retrying in ${delayMs}ms:`, error instanceof Error ? error.message : String(error));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Write Egypt snapshot to Supabase in wide format
 * Creates ONE row with all karat prices in wide columns
 * Includes retry logic for network failures
 */
export async function writeEgyptSnapshotToSupabase(
  params: WriteEgyptSnapshotParams
): Promise<WriteResult> {
  try {
    const supabase = db.supabase;
    // createdAt is stored as bigint (epoch milliseconds number) in Supabase
    // Use the number directly - Supabase handles bigint conversion
    const createdAt = params.createdAtMs;

    // Build ONE wide row with all karat prices
    const row: Record<string, unknown> = {
      source: params.source,
      createdAt: createdAt,
      rawHash: params.rawHash || null,
      // IMPORTANT:
      // Several read paths (health + homepage medians) filter with `error IS NULL`.
      // If we omit `error` in INSERT, the DB default may be non-null (e.g. empty string),
      // causing inserts to be ignored and resulting in "REFERENCE UNAVAILABLE".
      error: null,
      httpStatus: null,
      url: null,
      rawResponseSnippet: null,
      ingestion_run_id: params.ingestionRunId ?? null,
      is_degraded: params.isDegraded ?? false,
      source_write_count: params.sourceWriteCount ?? null,
      fresh_source_count: params.freshSourceCount ?? null,
      degraded_reason: params.degradedReason ?? null,
    };

    // Add buy prices for each karat (only if valid)
    const karats: (14 | 18 | 21 | 24)[] = [14, 18, 21, 24];
    for (const karat of karats) {
      const priceData = params.prices[karat];
      const buyPrice = priceData?.buy;
      const sellPrice = priceData?.sell;
      
      if (karat === 21) {
        row.market21Buy = (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) ? buyPrice : null;
        row.market21Sell = (sellPrice !== null && sellPrice !== undefined && isFinite(sellPrice) && sellPrice > 0) ? sellPrice : null;
      } else if (karat === 24) {
        row.market24Buy = (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) ? buyPrice : null;
        row.market24Sell = (sellPrice !== null && sellPrice !== undefined && isFinite(sellPrice) && sellPrice > 0) ? sellPrice : null;
      } else if (karat === 18) {
        row.market18Buy = (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) ? buyPrice : null;
        row.market18Sell = (sellPrice !== null && sellPrice !== undefined && isFinite(sellPrice) && sellPrice > 0) ? sellPrice : null;
      } else if (karat === 14) {
        row.market14Buy = (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) ? buyPrice : null;
        row.market14Sell = (sellPrice !== null && sellPrice !== undefined && isFinite(sellPrice) && sellPrice > 0) ? sellPrice : null;
      }
    }

    // Check if we have at least one valid price
    const hasValidPrice = row.market21Buy !== null || row.market24Buy !== null || 
                          row.market18Buy !== null || row.market14Buy !== null;

    if (!hasValidPrice) {
      console.warn('[Supabase] Skipping wide insert (no valid price):', {
        source: row.source,
        createdAt: row.createdAt,
        market21Buy: row.market21Buy,
        market24Buy: row.market24Buy,
        market18Buy: row.market18Buy,
        market14Buy: row.market14Buy,
      });
      return { ok: true, inserted: 0 };
    }

    // Insert ONE wide row with retry logic for network failures
    console.log('[Supabase] Writing snapshot:', { source: row.source, createdAt: row.createdAt, has21k: !!row.market21Buy, has24k: !!row.market24Buy });
    
    try {
      const { error, data: inserted } = await retrySupabaseOperation(async () => {
        console.log('[Supabase] INSERT wide -> market_snapshots (pre):', {
          table: 'market_snapshots',
          source: row.source,
          createdAt: row.createdAt,
          rawHashPrefix: row.rawHash ? String(row.rawHash).slice(0, 8) : null,
          market21Buy: row.market21Buy,
          market24Buy: row.market24Buy,
          market18Buy: row.market18Buy,
          market14Buy: row.market14Buy,
          errorValue: row.error,
        });

        const result = await supabase
          .from('market_snapshots')
          .insert(row)
          .select('id');

        console.log('[Supabase] INSERT wide -> market_snapshots (post):', {
          table: 'market_snapshots',
          source: row.source,
          createdAt: row.createdAt,
          insertedIdsPreview: (result.data || []).slice(0, 3).map((r: any) => r?.id),
          insertedRowsCount: result.data?.length || 0,
          errorMessage: result.error?.message || null,
          errorCode: (result.error as any)?.code || null,
          errorDetails: (result.error as any)?.details || null,
          errorHint: (result.error as any)?.hint || null,
        });

        // Check for network errors in the error object or thrown exceptions
        if (result.error) {
          const errorMsg = result.error.message || String(result.error);
            const errorCode = (result.error as any).code;
            const errorDetails = (result.error as any).details;
            const errorHint = (result.error as any).hint;
          const isNetworkError = 
            errorMsg.includes('fetch failed') ||
            errorMsg.includes('ECONNRESET') ||
            errorMsg.includes('SocketError') ||
            errorMsg.includes('UND_ERR_SOCKET') ||
              (errorDetails?.includes?.('fetch failed') ?? false) ||
              (errorDetails?.includes?.('ECONNRESET') ?? false);
          
          if (isNetworkError) {
            throw new Error(errorMsg);
          }
        }
        return result;
      });

      if (error) {
          console.error('[Supabase] Wide INSERT failed (from retry result):', {
            table: 'market_snapshots',
            source: row.source,
            createdAt: row.createdAt,
            errorMessage: error.message,
            errorCode: (error as any).code,
            errorDetails: (error as any).details,
            errorHint: (error as any).hint,
          });
          console.error('[Supabase] Write error:', {
            message: error.message,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
            rowAttempted: {
              source: row.source,
              createdAt: row.createdAt,
              has21k: !!row.market21Buy,
              has24k: !!row.market24Buy,
              errorValue: row.error,
            },
          });
        return {
          ok: false,
          inserted: 0,
          error: error.message || error.details || String(error),
        };
      }

      console.log('[Supabase] Successfully inserted snapshot:', { id: inserted?.[0]?.id, source: row.source });

      return {
        ok: true,
        inserted: inserted?.length || 1,
      };
    } catch (networkError) {
      // Network error after retries exhausted
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

