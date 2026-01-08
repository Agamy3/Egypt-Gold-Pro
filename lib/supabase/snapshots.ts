/**
 * Supabase Snapshot Writer
 * 
 * Helper functions for writing market snapshots to Supabase
 * Uses normalized schema: one row per source/karat combination
 */

import db from '../supabase';

/**
 * Insert market snapshot into Supabase (normalized schema)
 * Converts from wide SQLite format to normalized format
 * 
 * @param data - Snapshot data in SQLite format (wide columns)
 * @returns Promise<{ success: boolean; insertedRows: number; error?: string }>
 */
export async function insertMarketSnapshot(
  data: {
    createdAt: number; // Integer ms timestamp
    source: string;
    market21Buy?: number | null;
    market21Sell?: number | null;
    market24Buy?: number | null;
    market24Sell?: number | null;
    market18Buy?: number | null;
    market18Sell?: number | null;
    market14Buy?: number | null;
    market14Sell?: number | null;
    usdBuy?: number | null;
    usdSell?: number | null;
    rawHash?: string | null;
    error?: string | null;
    httpStatus?: number | null;
    url?: string | null;
    rawResponseSnippet?: string | null;
    trusted?: boolean; // Optional trusted flag
  }
): Promise<{ success: boolean; insertedRows: number; error?: string }> {
  try {
    const supabase = db.supabase;
    const createdAt = new Date(data.createdAt).toISOString();
    const rows: any[] = [];

    // Normalize: create one row per karat with price data
    const karats = [
      { karat: 21, buy: data.market21Buy, sell: data.market21Sell },
      { karat: 24, buy: data.market24Buy, sell: data.market24Sell },
      { karat: 18, buy: data.market18Buy, sell: data.market18Sell },
      { karat: 14, buy: data.market14Buy, sell: data.market14Sell },
    ];

    for (const { karat, buy, sell } of karats) {
      // Only insert if we have at least a buy price
      if (buy !== null && buy !== undefined && isFinite(buy) && buy > 0) {
        rows.push({
          market: 'egypt',
          karat,
          price_egp: buy,
          source: data.source,
          trusted: data.trusted ?? false,
          created_at: createdAt,
          raw_hash: data.rawHash || null,
          // Note: new schema doesn't have separate sell column in normalized format
          // If we need sell prices, we'd need to store them differently or add a sell_price_egp column
        });
      }
    }

    // If no valid prices, don't insert anything
    if (rows.length === 0) {
      return { success: true, insertedRows: 0 };
    }

    // Insert all rows in a batch
    const { error, data: inserted } = await supabase
      .from('market_snapshots')
      .insert(rows)
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return {
        success: false,
        insertedRows: 0,
        error: error.message,
      };
    }

    return {
      success: true,
      insertedRows: inserted?.length || rows.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Supabase snapshot insert exception:', errorMessage);
    return {
      success: false,
      insertedRows: 0,
      error: errorMessage,
    };
  }
}

/**
 * Check if Supabase is available and can write
 */
export async function checkSupabaseWrite(): Promise<{
  ok: boolean;
  lastInsertOk?: boolean;
  lastInsertTime?: number;
  lastError?: string;
}> {
  try {
    const supabase = db.supabase;
    
    // Try a simple count query to verify access
    const { count, error } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        ok: false,
        lastError: error.message,
      };
    }

    // Check for recent inserts (last 10 minutes) for market='egypt'
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from('market_snapshots')
      .select('created_at')
      .eq('market', 'egypt')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true,
      lastInsertOk: recent !== null && !recentError,
      lastInsertTime: recent ? new Date(recent.created_at).getTime() : undefined,
      lastError: recentError?.message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      lastError: errorMessage,
    };
  }
}

