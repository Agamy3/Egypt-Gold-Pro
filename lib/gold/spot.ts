/**
 * Canonical XAU/USD spot price module
 * 
 * Provides functions for fetching and storing global XAU/USD spot prices.
 * Uses gold_spot table (or fallback to direct API fetch if table missing).
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchGoldApiQuote } from '@/lib/priceFeed/goldapi';
import { getLatestGoldSpot, insertGoldSpot } from '@/lib/supabase/goldSpot';

export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function computeAgeSeconds(fetchedAtIso: string | null, now: Date): number | null {
  if (!fetchedAtIso) return null;
  try {
    const fetched = new Date(fetchedAtIso);
    const ageMs = now.getTime() - fetched.getTime();
    return Math.max(0, Math.floor(ageMs / 1000));
  } catch {
    return null;
  }
}

export function spotIsStale(fetchedAtIso: string | null, now: Date): boolean {
  const ageSeconds = computeAgeSeconds(fetchedAtIso, now);
  if (ageSeconds === null) return true;
  return ageSeconds > 10 * 60; // 10 minutes
}

export function isSpotTableMissing(result: { ok: boolean; error?: string }): boolean {
  // Check if error indicates missing table
  if (!result.ok && result.error) {
    const err = result.error.toLowerCase();
    return err.includes('relation') && err.includes('does not exist');
  }
  return false;
}

export async function fetchGoldApiSpot(input: { traceId: string }): Promise<{
  ok: boolean;
  price?: number;
  fetchedAtIso?: string;
  raw?: any;
  error?: string;
}> {
  try {
    const quote = await fetchGoldApiQuote();
    return {
      ok: true,
      price: quote.price,
      fetchedAtIso: new Date(quote.timestampMs).toISOString(),
      raw: quote.raw,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  }
}

export async function getLatestSpot(
  supabase: SupabaseClient,
  input: { traceId: string }
): Promise<{
  ok: boolean;
  row?: { price_usd_per_oz: number; fetched_at: string; source: string } | null;
  error?: string;
}> {
  try {
    const cached = await getLatestGoldSpot();
    if (cached) {
      return {
        ok: true,
        row: {
          price_usd_per_oz: cached.xau_spot_usd_oz,
          fetched_at: new Date(cached.fetched_at).toISOString(),
          source: cached.source,
        },
      };
    }
    return { ok: true, row: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'query_failed',
    };
  }
}

export async function storeSpotTick(
  supabase: SupabaseClient,
  input: { price: number; fetchedAtIso: string; raw?: any; traceId: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fetchedAtMs = new Date(input.fetchedAtIso).getTime();
    await insertGoldSpot(input.price, 'goldapi', fetchedAtMs, false);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'store_failed',
    };
  }
}
