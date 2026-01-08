/**
 * Write Egypt Market Snapshot to Supabase (Server-Only)
 * 
 * Writes normalized rows to Supabase market_snapshots table
 * One row per karat with buy price
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
 * Write Egypt snapshot to Supabase in normalized format
 * Creates one row per karat with buy price
 */
export async function writeEgyptSnapshotToSupabase(
  params: WriteEgyptSnapshotParams
): Promise<WriteResult> {
  try {
    const supabase = db.supabase;
    const createdAt = new Date(params.createdAtMs).toISOString();
    const rows: any[] = [];

    // Build rows: one per karat with valid buy price
    const karats: (14 | 18 | 21 | 24)[] = [14, 18, 21, 24];
    
    for (const karat of karats) {
      const priceData = params.prices[karat];
      const buyPrice = priceData?.buy;
      
      // Only insert if we have a valid buy price
      if (buyPrice !== null && buyPrice !== undefined && isFinite(buyPrice) && buyPrice > 0) {
        rows.push({
          market: 'egypt',
          karat,
          price_egp: buyPrice,
          source: params.source,
          trusted: params.trusted,
          created_at: createdAt,
          raw_hash: params.rawHash || null,
        });
      }
    }

    // If no valid prices, return success with 0 inserted
    if (rows.length === 0) {
      return { ok: true, inserted: 0 };
    }

    // Insert all rows in a batch
    const { error, data: inserted } = await supabase
      .from('market_snapshots')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[Supabase] Write error:', error);
      return {
        ok: false,
        inserted: 0,
        error: error.message,
      };
    }

    const insertedCount = inserted?.length || rows.length;
    return {
      ok: true,
      inserted: insertedCount,
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

