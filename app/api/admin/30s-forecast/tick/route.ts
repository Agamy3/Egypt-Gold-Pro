import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { getLatestGlobalOunce, getGlobalOunceWindow } from '@/lib/market/globalOunce';
import { thirtySecondHeuristic } from '@/lib/forecast/thirtySecondHeuristic';
import { dynamic, revalidate, withNoStoreHeaders } from '../_util';

export { dynamic, revalidate };

type PredRow = {
  id: string;
  predicted_direction: 'UP' | 'DOWN' | 'STALE';
  p0: number;
  p0_at: string;
  due_at: string;
};

const HORIZON_SECONDS = 30;
const STALE_AFTER_SECONDS = 120;
const NOTIONAL_USD = 10;

function asNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST() {
  try {
    await requireAdmin();

    const supabaseAdmin = getServerClient();

    const latestRes = await getLatestGlobalOunce(supabaseAdmin, { staleAfterSeconds: STALE_AFTER_SECONDS });
    if (!latestRes.ok) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: latestRes.error }, { status: 500 })
      );
    }

    const latest = latestRes.point;
    const isStale = latestRes.isStale;
    const pLatest = latest.price;
    const pointAt = latest.pointAt.toISOString();

    // 1) Validate due predictions
    const now = new Date();
    const nowIsoStr = now.toISOString();

    const { data: due, error: dueErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('id, predicted_direction, p0, p0_at, due_at')
      .is('validated_at', null)
      .lte('due_at', nowIsoStr)
      .order('due_at', { ascending: true })
      .limit(50);

    if (dueErr) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: dueErr.message }, { status: 500 })
      );
    }

    let validatedCount = 0;
    const eps = 1e-9;

    for (const row of (due || []) as unknown as PredRow[]) {
      const p0 = asNumber(row.p0);
      if (p0 === null) continue;
      const p1 = pLatest;

      let result: 'TRUE' | 'FALSE' | 'TIE' | 'NA' = 'NA';
      if (row.predicted_direction === 'STALE') {
        result = 'NA';
      } else if (Math.abs(p1 - p0) <= eps) {
        result = 'TIE';
      } else if (row.predicted_direction === 'UP') {
        result = p1 > p0 ? 'TRUE' : 'FALSE';
      } else if (row.predicted_direction === 'DOWN') {
        result = p1 < p0 ? 'TRUE' : 'FALSE';
      }

      const { error: updErr } = await supabaseAdmin
        .from('admin_30s_predictions')
        .update({
          validated_at: nowIsoStr,
          p1,
          result,
        })
        .eq('id', row.id);

      if (updErr) continue;
      validatedCount += 1;

      // Trades: only if predicted UP/DOWN (judged trade); STALE => no trade.
      if (row.predicted_direction === 'UP' || row.predicted_direction === 'DOWN') {
        const side: 'LONG' | 'SHORT' = row.predicted_direction === 'UP' ? 'LONG' : 'SHORT';
        const qtyOz = NOTIONAL_USD / p0;
        const pnlUsd = side === 'LONG' ? qtyOz * (p1 - p0) : qtyOz * (p0 - p1);

        await supabaseAdmin.from('admin_30s_trades').insert({
          prediction_id: row.id,
          side,
          notional_usd: NOTIONAL_USD,
          qty_oz: qtyOz,
          entry_price: p0,
          exit_price: p1,
          pnl_usd: pnlUsd,
          closed_at: nowIsoStr,
        });
      }
    }

    // 2) Create new prediction
    const t0 = new Date();
    const p0 = pLatest;
    const p0At = t0.toISOString();
    const dueAt = new Date(t0.getTime() + HORIZON_SECONDS * 1000).toISOString();

    let predicted_direction: 'UP' | 'DOWN' | 'STALE' = 'STALE';
    let meta: Record<string, unknown> = {};

    if (isStale) {
      predicted_direction = 'STALE';
      meta = { reason: 'stale_data', staleAfterSeconds: STALE_AFTER_SECONDS, latestPointAt: pointAt };
    } else {
      const windowRes = await getGlobalOunceWindow(supabaseAdmin, 120);
      if (!windowRes.ok) {
        predicted_direction = 'STALE';
        meta = { reason: 'window_fetch_failed', error: windowRes.error, latestPointAt: pointAt };
      } else {
        const h = thirtySecondHeuristic({
          isStale,
          latestPrice: p0,
          latestAtMs: latest.fetchedAtMs,
          windowPoints: windowRes.points,
          horizonSeconds: HORIZON_SECONDS,
          windowSeconds: 120,
          absoluteMin: 0.05,
          k: 1.0,
        });
        predicted_direction = h.direction;
        meta = {
          ...h.meta,
          latestPointAt: pointAt,
          latestPrice: p0,
        };
      }
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .insert({
        horizon_seconds: HORIZON_SECONDS,
        predicted_direction,
        p0,
        p0_at: p0At,
        due_at: dueAt,
        source: 'gold_spot',
        meta,
      })
      .select('id, p0_at, due_at, predicted_direction, p0, source, meta')
      .single();

    if (insErr) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
      );
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        createdPrediction: created,
        validated: { count: validatedCount },
        latest: { price: pLatest, pointAt, isStale },
        meta: { serverAsOf: nowIso() },
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

