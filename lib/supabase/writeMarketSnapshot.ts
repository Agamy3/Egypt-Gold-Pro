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
 * Write Egypt snapshot to Supabase in wide format
 * Creates ONE row with all karat prices in wide columns
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
    const row: any = {
      source: params.source,
      createdAt: createdAt,
      rawHash: params.rawHash || null,
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
      return { ok: true, inserted: 0 };
    }

    // Insert ONE wide row
    console.log('[Supabase] Writing snapshot:', { source: row.source, createdAt: row.createdAt, has21k: !!row.market21Buy, has24k: !!row.market24Buy });
    const { error, data: inserted } = await supabase
      .from('market_snapshots')
      .insert(row)
      .select('id');

    if (error) {
      console.error('[Supabase] Write error:', error, 'Row attempted:', { source: row.source, createdAt: row.createdAt });
      return {
        ok: false,
        inserted: 0,
        error: error.message,
      };
    }

    console.log('[Supabase] Successfully inserted snapshot:', { id: inserted?.[0]?.id, source: row.source });

    return {
      ok: true,
      inserted: inserted?.length || 1,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Supabase] Write exception:', errorMessage);
    return {
      ok: false,
      inserted: 0,
      error: errorMessage,
    };
  }
}

