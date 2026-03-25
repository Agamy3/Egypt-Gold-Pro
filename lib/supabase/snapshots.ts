/**
 * Supabase Snapshot Writer
 * 
 * Helper functions for writing market snapshots to Supabase
 * Uses wide schema: one row per source snapshot with all karat prices
 */

import db from '../supabase';

/**
 * Insert market snapshot into Supabase (wide schema)
 * Inserts ONE wide row with all karat prices
 * 
 * @param data - Snapshot data in wide format
 * @returns Promise<{ success: boolean; insertedRows: number; error?: string }>
 */
export async function insertMarketSnapshot(
  data: {
    createdAt: number; // Integer ms timestamp (epoch ms)
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
  }
): Promise<{ success: boolean; insertedRows: number; error?: string }> {
  try {
    const supabase = db.supabase;
    const createdAt = data.createdAt; // Use epoch ms directly (createdAt is bigint)

    // Build ONE wide row
    const row: Record<string, unknown> = {
      source: data.source,
      createdAt: createdAt,
      rawHash: data.rawHash || null,
      error: data.error || null,
      httpStatus: data.httpStatus || null,
      url: data.url || null,
      rawResponseSnippet: data.rawResponseSnippet || null,
      market21Buy: data.market21Buy || null,
      market21Sell: data.market21Sell || null,
      market24Buy: data.market24Buy || null,
      market24Sell: data.market24Sell || null,
      market18Buy: data.market18Buy || null,
      market18Sell: data.market18Sell || null,
      market14Buy: data.market14Buy || null,
      market14Sell: data.market14Sell || null,
      usdBuy: data.usdBuy || null,
      usdSell: data.usdSell || null,
    };

    // Check if we have at least one valid price
    const hasValidPrice = row.market21Buy !== null || row.market24Buy !== null || 
                          row.market18Buy !== null || row.market14Buy !== null;

    if (!hasValidPrice) {
      return { success: true, insertedRows: 0 };
    }

    // Insert ONE wide row
    const { error, data: inserted } = await supabase
      .from('market_snapshots')
      .insert(row)
      .select('id');

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
      insertedRows: inserted?.length || 1,
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
    const { error } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        ok: false,
        lastError: error.message,
      };
    }

    // Check for recent inserts (last 10 minutes) using createdAt (bigint, use epoch ms number)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const { data: recent, error: recentError } = await supabase
      .from('market_snapshots')
      .select('createdAt')
      .gte('createdAt', tenMinutesAgo) // createdAt is bigint, use epoch ms number
      .is('error', null)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true,
      lastInsertOk: recent !== null && !recentError,
      lastInsertTime: recent ? (typeof recent.createdAt === 'string' ? new Date(recent.createdAt).getTime() : (recent.createdAt as number)) : undefined,
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

