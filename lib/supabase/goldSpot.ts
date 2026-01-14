/**
 * Supabase Gold Spot Helper
 * 
 * Manages gold spot price caching in Supabase (replaces SQLite gold_spot table)
 * Uses SQLite schema column names: fetched_at (bigint epoch ms), source
 */

import 'server-only';
import db from '../supabase';
import { fetchGlobalSpot, fetchStooqHistoryDaily } from '../spot-fetch';
import { fetchImpliedOunce } from '../implied-ounce';

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

    const rows = data.map(row => ({
      xau_spot_usd_oz: row.xau_spot_usd_oz,
      fetched_at: row.fetched_at as number, // Already in epoch ms (bigint)
    }));

    // If history looks stale, fetch a fresh latest point and cache it.
    // This prevents weekly/monthly/yoy fallback series from "ending early" and looking flat/incorrect.
    const now = Date.now();
    const lastAt = rows.length > 0 ? rows[rows.length - 1].fetched_at : null;
    const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
    const VERY_STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

    if (lastAt === null || now - lastAt > STALE_AFTER_MS) {
      // If we are very stale, backfill a few daily points from Stooq history so weekly/monthly
      // doesn't degrade into a misleading flat line.
      if (lastAt === null || now - lastAt > VERY_STALE_AFTER_MS) {
        const hist = await fetchStooqHistoryDaily(14);
        if (hist.points.length > 0) {
          for (const pt of hist.points) {
            if (pt.t < windowStartMs) continue;
            // Skip if already have a point on the same day (UTC) to avoid duplicates.
            const dayKey = new Date(pt.t).toISOString().slice(0, 10);
            const already = rows.some((r) => new Date(r.fetched_at).toISOString().slice(0, 10) === dayKey);
            if (already) continue;
            try {
              await insertGoldSpot(pt.v, 'StooqHistory', pt.t, false);
            } catch {
              // ignore cache failures
            }
            rows.push({ xau_spot_usd_oz: pt.v, fetched_at: pt.t });
          }
        }
      }

      // Prefer gold-api.com (free, no key) for a fresher moving series.
      // If that fails, fall back to fetchGlobalSpot (GoldAPI.io -> Stooq).
      const implied = await fetchImpliedOunce();
      const res =
        implied.price !== null && implied.source
          ? { price: implied.price, source: implied.source as string }
          : await fetchGlobalSpot();

      if (res.price && res.price > 0 && res.source) {
        // Non-fatal cache write
        try {
          await insertGoldSpot(res.price, res.source, now, false);
        } catch {
          // ignore cache failures
        }

        // Include the fresh point in the returned history if within window
        if (now >= windowStartMs) {
          rows.push({ xau_spot_usd_oz: res.price, fetched_at: now });
        }
      }
    }

    rows.sort((a, b) => a.fetched_at - b.fetched_at);
    return rows;
  } catch (error) {
    console.error('[Supabase] Error getting gold spot history:', error);
    return [];
  }
}

