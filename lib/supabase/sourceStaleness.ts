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
 * Update staleness for a source+karat combination
 */
export async function updateSourceStaleness(
  source: string,
  karat: Karat,
  lastOkTimestampMs: number,
  lastOkBuy: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await db.supabase
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

    if (error) {
      console.error('[Supabase] Error updating source staleness:', error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

