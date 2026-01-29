/**
 * Global ounce (XAU spot) helpers (server-only usage).
 *
 * Source of truth: Supabase table `gold_spot`:
 * - xau_spot_usd_oz (number)
 * - fetched_at (epoch ms)
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type GlobalOuncePoint = {
  price: number;
  pointAt: Date;
  fetchedAtMs: number;
  source: string | null;
  stale: boolean;
};

export async function getLatestGlobalOunce(
  supabase: SupabaseClient,
  opts?: { staleAfterSeconds?: number }
): Promise<{ ok: true; point: GlobalOuncePoint; isStale: boolean } | { ok: false; error: string }> {
  const staleAfterSeconds = opts?.staleAfterSeconds ?? 120;
  const nowMs = Date.now();

  const { data, error } = await supabase
    .from('gold_spot')
    .select('xau_spot_usd_oz, fetched_at, stale, source')
    .order('fetched_at', { ascending: false })
    .limit(1);

  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, error: 'No gold_spot rows found' };

  const fetchedAtMs = Number(row.fetched_at);
  const price = Number(row.xau_spot_usd_oz);

  if (!isFinite(fetchedAtMs) || fetchedAtMs <= 0) return { ok: false, error: 'Invalid fetched_at' };
  if (!isFinite(price) || price <= 0) return { ok: false, error: 'Invalid xau_spot_usd_oz' };

  const pointAt = new Date(fetchedAtMs);
  const ageSeconds = (nowMs - fetchedAtMs) / 1000;
  const isStale = ageSeconds > staleAfterSeconds;

  return {
    ok: true,
    point: {
      price,
      pointAt,
      fetchedAtMs,
      source: row.source ? String(row.source) : null,
      stale: Boolean(row.stale),
    },
    isStale,
  };
}

export async function getGlobalOunceWindow(
  supabase: SupabaseClient,
  secondsBack: number
): Promise<{ ok: true; points: Array<{ t: number; v: number }> } | { ok: false; error: string }> {
  const nowMs = Date.now();
  const startMs = nowMs - Math.max(1, Math.floor(secondsBack)) * 1000;

  const { data, error } = await supabase
    .from('gold_spot')
    .select('xau_spot_usd_oz, fetched_at')
    .gte('fetched_at', startMs)
    .order('fetched_at', { ascending: true })
    .limit(5000);

  if (error) return { ok: false, error: error.message };
  const points =
    (data || [])
      .map((r) => ({ t: Number(r.fetched_at), v: Number(r.xau_spot_usd_oz) }))
      .filter((p) => isFinite(p.t) && p.t > 0 && isFinite(p.v) && p.v > 0)
      .sort((a, b) => a.t - b.t);

  return { ok: true, points };
}

