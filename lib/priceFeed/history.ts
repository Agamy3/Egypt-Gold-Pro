import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getRecentPricesForVolatility(
  supabase: SupabaseClient,
  opts?: { secondsBack?: number; limit?: number; source?: string }
): Promise<{ ok: true; prices: number[]; points: Array<{ t: number; v: number }> } | { ok: false; error: string }> {
  const secondsBack = opts?.secondsBack ?? 120;
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
        t: Date.parse(String((r as any).p0_at)),
        v: Number((r as any).p0),
      }))
      .filter((p) => isFinite(p.t) && isFinite(p.v) && p.v > 0)
      .sort((a, b) => a.t - b.t);

  return { ok: true, prices: points.map((p) => p.v), points };
}

export async function getPriceAroundSecondsAgo(
  supabase: SupabaseClient,
  secondsAgo: number,
  opts?: { source?: string }
): Promise<{ ok: true; price: number; atIso: string } | { ok: false; error: string }> {
  const source = opts?.source ?? 'goldapi_xauusd';
  const targetIso = new Date(Date.now() - secondsAgo * 1000).toISOString();

  const { data, error } = await supabase
    .from('admin_30s_predictions')
    .select('p0, p0_at')
    .eq('source', source)
    .lte('p0_at', targetIso)
    .order('p0_at', { ascending: false })
    .limit(1);

  if (error) return { ok: false, error: error.message };
  const row = data?.[0] as any;
  if (!row) return { ok: false, error: 'No reference price found' };

  const p = Number(row.p0);
  const atIso = String(row.p0_at);
  if (!isFinite(p) || p <= 0) return { ok: false, error: 'Invalid reference price' };
  if (!atIso) return { ok: false, error: 'Invalid reference timestamp' };

  return { ok: true, price: p, atIso };
}

