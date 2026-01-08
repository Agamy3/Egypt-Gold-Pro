/**
 * Supabase Gold Spot Helper
 * 
 * Manages gold spot price caching in Supabase (replaces SQLite gold_spot table)
 * Uses SQLite schema column names: fetched_at (bigint epoch ms), source
 */

import 'server-only';
import db from '../supabase';

export interface GoldSpotData {
  xau_spot_usd_oz: number;
  source: string;
  fetched_at: number;
  stale: boolean;
}

/**
 * Get latest gold spot from Supabase cache
 */
export async function getLatestGoldSpot(): Promise<GoldSpotData | null> {
  try {
    const { data, error } = await db.supabase
      .from('gold_spot')
      .select('xau_spot_usd_oz, source, fetched_at, stale')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      xau_spot_usd_oz: data.xau_spot_usd_oz,
      source: data.source || 'GoldAPI',
      fetched_at: data.fetched_at as number, // Already in epoch ms (bigint)
      stale: data.stale,
    };
  } catch (error) {
    console.error('[Supabase] Error getting latest gold spot:', error);
    return null;
  }
}

/**
 * Insert new gold spot into Supabase
 */
export async function insertGoldSpot(
  xau_spot_usd_oz: number,
  source: string,
  fetched_at_ms: number,
  stale: boolean = false
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await db.supabase
      .from('gold_spot')
      .insert({
        xau_spot_usd_oz,
        source: source || 'GoldAPI',
        fetched_at: fetched_at_ms, // Use bigint (epoch ms) to match SQLite schema
        stale,
      });

    if (error) {
      console.error('[Supabase] Error inserting gold spot:', error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Supabase] Exception inserting gold spot:', errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/**
 * Get gold spot history within time window
 */
export async function getGoldSpotHistory(
  windowStartMs: number
): Promise<Array<{ xau_spot_usd_oz: number; fetched_at: number }>> {
  try {
    const { data, error } = await db.supabase
      .from('gold_spot')
      .select('xau_spot_usd_oz, fetched_at')
      .gte('fetched_at', windowStartMs) // Compare bigint directly
      .order('fetched_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map(row => ({
      xau_spot_usd_oz: row.xau_spot_usd_oz,
      fetched_at: row.fetched_at as number, // Already in epoch ms (bigint)
    }));
  } catch (error) {
    console.error('[Supabase] Error getting gold spot history:', error);
    return [];
  }
}

