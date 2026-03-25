import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

type PredRow = { p0: unknown; p0_at: unknown };

export async function getRecentPricesForVolatility(
  supabase: SupabaseClient,
  opts?: { secondsBack?: number; limit?: number; source?: string }
): Promise<{ ok: true; prices: number[]; points: Array<{ t: number; v: number }> } | { ok: false; error: string }> {
  const secondsBack = opts?.secondsBack ?? 60;
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const source = opts?.source ?? 'goldapi_xauusd';

  const sinceIso = new Date(Date.now() - secondsBack * 1000).toISOString();

  const { data, error } = await supabase
    .from('admin_30s_predictions')
    .select('p0, p0_at')
    .eq('source', source)
    .gte('p0_at', sinceIso)
    .order('p0_at', { ascending: true })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  const points =
    (data || [])
      .map((r) => ({
        t: Date.parse(String((r as PredRow).p0_at)),
        v: Number((r as PredRow).p0),
      }))
      .filter((p) => isFinite(p.t) && isFinite(p.v) && p.v > 0)
      .sort((a, b) => a.t - b.t);

  return { ok: true, prices: points.map((p) => p.v), points };
}

/**
 * Find the nearest prediction p0 around a target time (±toleranceSeconds).
 * Used to pick p30sAgo reference robustly.
 */
export async function getNearestPriceAroundTime(
  supabase: SupabaseClient,
  targetMs: number,
  opts?: { source?: string; toleranceSeconds?: number }
): Promise<{ ok: true; price: number; atIso: string; atMs: number } | { ok: false; error: string }> {
  const source = opts?.source ?? 'goldapi_xauusd';
  const toleranceSeconds = opts?.toleranceSeconds ?? 30;

  const minIso = new Date(targetMs - toleranceSeconds * 1000).toISOString();
  const maxIso = new Date(Math.min(Date.now(), targetMs + toleranceSeconds * 1000)).toISOString();

  const { data, error } = await supabase
    .from('admin_30s_predictions')
    .select('p0, p0_at')
    .eq('source', source)
    .gte('p0_at', minIso)
    .lte('p0_at', maxIso)
    .order('p0_at', { ascending: true })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  const points =
    (data || [])
      .map((r) => ({
        t: Date.parse(String((r as PredRow).p0_at)),
        iso: String((r as PredRow).p0_at),
        v: Number((r as PredRow).p0),
      }))
      .filter((p) => isFinite(p.t) && isFinite(p.v) && p.v > 0 && p.iso)
      .sort((a, b) => a.t - b.t);

  if (points.length === 0) return { ok: false, error: 'No reference price found' };

  let best = points[0];
  let bestDist = Math.abs(points[0].t - targetMs);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].t - targetMs);
    if (d < bestDist) {
      best = points[i];
      bestDist = d;
    }
  }

  return { ok: true, price: best.v, atIso: best.iso, atMs: best.t };
}

/**
 * Get the most recent prediction price at-or-before a target time.
 * Used for strict "p60sAgo reference" selection for the minute-bot.
 */
export async function getLatestPriceAtOrBeforeTime(
  supabase: SupabaseClient,
  targetMs: number,
  opts?: { source?: string }
): Promise<{ ok: true; price: number; atIso: string; atMs: number } | { ok: false; error: string }> {
  const source = opts?.source ?? 'goldapi_xauusd';
  const targetIso = new Date(targetMs).toISOString();

  const { data, error } = await supabase
    .from('admin_30s_predictions')
    .select('p0, p0_at')
    .eq('source', source)
    .lte('p0_at', targetIso)
    .order('p0_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No reference price found' };

  const price = Number((data as PredRow).p0);
  const atIso = String((data as PredRow).p0_at);
  const atMs = Date.parse(atIso);

  if (!isFinite(price) || price <= 0 || !isFinite(atMs) || !atIso) {
    return { ok: false, error: 'Invalid reference price row' };
  }

  return { ok: true, price, atIso, atMs };
}

