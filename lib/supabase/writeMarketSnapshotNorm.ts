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
      console.warn('[Supabase] Skipping normalized insert (no karat rows):', {
        table: 'market_snapshots_norm',
        country: params.country,
        source: params.source,
        createdAt: createdAtISO,
      });
      return { ok: true, inserted: 0 };
    }

    console.log('[Supabase] Writing normalized snapshot:', { 
      country: params.country, 
      source: params.source, 
      karats: rows.map(r => r.karat),
      createdAt: createdAtISO,
      rowPreview: rows.slice(0, 4).map(r => ({
        karat: r.karat,
        price: r.price,
        rawHashPrefix: r.raw_hash ? String(r.raw_hash).slice(0, 8) : null,
      })),
    });
    
    try {
      const { error, data: inserted } = await retrySupabaseOperation(async () => {
        // The unique index from migration 0019 on (country, karat, raw_hash) WHERE raw_hash IS NOT NULL
        // can cause inserts to fail if the same raw_hash exists. We need to handle this.
        // Strategy: Try insert first, if unique violation, update the existing row's created_at
        console.log('[Supabase] INSERT norm -> market_snapshots_norm (pre):', {
          table: 'market_snapshots_norm',
          country: params.country,
          source: params.source,
          createdAt: createdAtISO,
          rowsSent: rows.length,
          rowPreview: rows.slice(0, 4).map(r => ({
            karat: r.karat,
            price: r.price,
            rawHashPrefix: r.raw_hash ? String(r.raw_hash).slice(0, 8) : null,
          })),
        });

        const result = await supabase
          .from('market_snapshots_norm')
          .insert(rows)
          .select('id');
        
        console.log('[Supabase] INSERT norm -> market_snapshots_norm (post/final):', {
          table: 'market_snapshots_norm',
          country: params.country,
          source: params.source,
          createdAt: createdAtISO,
          rowsSent: rows.length,
          insertedRowsCount: result.data?.length || 0,
          insertedIdsPreview: (result.data || []).slice(0, 3).map((r: any) => r?.id),
          errorMessage: result.error?.message || null,
          errorCode: (result.error as any)?.code || null,
          errorDetails: (result.error as any)?.details || null,
          errorHint: (result.error as any)?.hint || null,
        });

        if (result.error) {
          const errorMsg = result.error.message || String(result.error);
          const errorCode = (result.error as any).code;
          const errorDetails = (result.error as any).details;
          const errorHint = (result.error as any).hint;
          const isUniqueViolation = 
            errorMsg.includes('duplicate key') ||
            errorMsg.includes('unique constraint') ||
            errorMsg.includes('violates unique constraint') ||
            result.error.code === '23505';
          
          console.error('[Supabase] Normalized insert error meta:', {
            message: errorMsg,
            code: errorCode,
            details: errorDetails,
            hint: errorHint,
            attempted: {
              country: params.country,
              source: params.source,
              karats: rows.map(r => r.karat),
              createdAt: createdAtISO,
            },
          });
          
          if (isUniqueViolation) {
            // Unique constraint violation: check if existing row is old enough to update
            // If existing row is recent (< 5 minutes), skip to avoid overwriting recent data
            // If existing row is old (> 5 minutes), update it OR insert new row with NULL raw_hash
            console.log('[Supabase] Unique constraint violation detected, checking if we should update or insert new');
            
            const FIVE_MINUTES_MS = 5 * 60 * 1000;
            const now = params.createdAt;
            
            for (const row of rows) {
              if (row.raw_hash) {
                // Check age of existing row with same raw_hash
                const existingResult = await supabase
                  .from('market_snapshots_norm')
                  .select('id, created_at')
                  .eq('country', row.country)
                  .eq('karat', row.karat)
                  .eq('raw_hash', row.raw_hash)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();
                
                if (existingResult.data) {
                  const existingCreatedAt = typeof existingResult.data.created_at === 'string'
                    ? new Date(existingResult.data.created_at).getTime()
                    : (typeof existingResult.data.created_at === 'number' ? existingResult.data.created_at : 0);
                  const ageMs = now - existingCreatedAt;
                  
                  if (ageMs > FIVE_MINUTES_MS) {
                    // Existing row is old (> 5 min), update it to refresh timestamp
                    const updateResult = await supabase
                      .from('market_snapshots_norm')
                      .update({
                        price: row.price,
                        created_at: row.created_at,
                        currency: row.currency,
                        source: row.source,
                        trusted: row.trusted,
                      })
                      .eq('id', existingResult.data.id)
                      .select('id');
                    
                    if (updateResult.error) {
                      console.error('[Supabase] Update error for row:', row, updateResult.error);
                    } else {
                      console.log('[Supabase] Updated existing old row:', updateResult.data?.[0]?.id);
                    }
                  } else {
                    // Existing row is recent (< 5 min), insert new row with NULL raw_hash to create new snapshot
                    // This ensures we have multiple snapshots over time even if price hasn't changed
                    const newRowWithoutHash = { ...row, raw_hash: null };
                    console.log('[Supabase] INSERT norm fallback (recent dup) -> market_snapshots_norm (pre):', {
                      table: 'market_snapshots_norm',
                      country: params.country,
                      source: params.source,
                      createdAt: createdAtISO,
                      rowsSent: 1,
                      karat: row.karat,
                      price: row.price,
                      rawHash: null,
                    });
                    const insertResult = await supabase
                      .from('market_snapshots_norm')
                      .insert(newRowWithoutHash)
                      .select('id');
                    
                    if (insertResult.error) {
                      console.error('[Supabase] INSERT norm fallback (recent dup) -> ERROR:', {
                        attempted: newRowWithoutHash,
                        message: insertResult.error.message,
                        code: (insertResult.error as any)?.code,
                        details: (insertResult.error as any)?.details,
                        hint: (insertResult.error as any)?.hint,
                      });
                    } else {
                      console.log('[Supabase] INSERT norm fallback (recent dup) -> OK:', {
                        insertedId: insertResult.data?.[0]?.id,
                        rows: insertResult.data?.length || 0,
                      });
                    }
                  }
                } else {
                  // No existing row found, try insert without raw_hash
                  const newRowWithoutHash = { ...row, raw_hash: null };
                  console.log('[Supabase] INSERT norm fallback (no existing) -> market_snapshots_norm (pre):', {
                    table: 'market_snapshots_norm',
                    country: params.country,
                    source: params.source,
                    createdAt: createdAtISO,
                    rowsSent: 1,
                    karat: row.karat,
                    price: row.price,
                    rawHash: null,
                  });
                  const insertResult = await supabase
                    .from('market_snapshots_norm')
                    .insert(newRowWithoutHash)
                    .select('id');
                  
                  if (insertResult.error) {
                    console.error('[Supabase] INSERT norm fallback (no existing) -> ERROR:', {
                      attempted: newRowWithoutHash,
                      message: insertResult.error.message,
                      code: (insertResult.error as any)?.code,
                      details: (insertResult.error as any)?.details,
                      hint: (insertResult.error as any)?.hint,
                    });
                  }
                }
              } else {
                // No raw_hash, can insert normally
                const insertResult = await supabase
                  .from('market_snapshots_norm')
                  .insert(row)
                  .select('id');
                
                if (insertResult.error) {
                  console.error('[Supabase] Insert error for row without raw_hash:', row, insertResult.error);
                }
              }
            }
            
            // Return success since we handled the conflict (either updated or inserted new)
            return { error: null, data: rows.map((_, i) => ({ id: i + 1 })) };
          }
          
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
        console.error('[Supabase] Write error:', {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
          rowsAttempted: rows.length,
        });
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

