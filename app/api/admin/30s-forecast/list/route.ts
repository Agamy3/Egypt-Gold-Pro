import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { dynamic, revalidate, withNoStoreHeaders } from '../_util';

export { dynamic, revalidate };

type Pred = {
  id: string;
  created_at: string;
  horizon_seconds: number;
  predicted_direction: 'UP' | 'DOWN' | 'STALE';
  p0: number;
  p0_at: string;
  due_at: string;
  validated_at: string | null;
  p1: number | null;
  result: 'TRUE' | 'FALSE' | 'TIE' | 'NA' | null;
  source: string;
  meta: any;
};

type Trade = {
  id: string;
  prediction_id: string;
  closed_at: string;
  side: 'LONG' | 'SHORT';
  notional_usd: number;
  qty_oz: number;
  entry_price: number;
  exit_price: number;
  pnl_usd: number;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const supabaseAdmin = getServerClient();

    const url = new URL(request.url);
    const days = clampInt(Number(url.searchParams.get('days') ?? 7), 1, 30);
    const limit = clampInt(Number(url.searchParams.get('limit') ?? 200), 1, 1000);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: preds, error: pErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('*')
      .gte('p0_at', since)
      .order('p0_at', { ascending: false })
      .limit(limit);

    if (pErr) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: pErr.message }, { status: 500 }));
    }

    const predictions = (preds || []) as unknown as Pred[];
    const ids = predictions.map((p) => p.id);

    const tradeByPredId = new Map<string, Trade>();
    if (ids.length > 0) {
      const { data: trades, error: tErr } = await supabaseAdmin
        .from('admin_30s_trades')
        .select('*')
        .in('prediction_id', ids);
      if (!tErr && trades) {
        for (const t of trades as unknown as Trade[]) {
          tradeByPredId.set(t.prediction_id, t);
        }
      }
    }

    // Stats
    let totalPredictions = predictions.length;
    let judgedPredictions = 0; // excludes STALE/NA
    let trueCount = 0;
    let falseCount = 0;
    let tieCount = 0;
    let naCount = 0;

    let totalTrades = 0;
    let cumulativePnl = 0;
    let wins = 0;

    for (const p of predictions) {
      if (p.predicted_direction === 'STALE' || p.result === 'NA') {
        naCount += 1;
      } else if (p.result === 'TRUE') {
        judgedPredictions += 1;
        trueCount += 1;
      } else if (p.result === 'FALSE') {
        judgedPredictions += 1;
        falseCount += 1;
      } else if (p.result === 'TIE') {
        judgedPredictions += 1;
        tieCount += 1;
      }

      const trade = tradeByPredId.get(p.id);
      if (trade) {
        totalTrades += 1;
        cumulativePnl += Number(trade.pnl_usd) || 0;
        if ((Number(trade.pnl_usd) || 0) > 0) wins += 1;
      }
    }

    const denomAccuracy = trueCount + falseCount; // exclude ties & NA
    const accuracy = denomAccuracy > 0 ? trueCount / denomAccuracy : null;
    const avgPnl = totalTrades > 0 ? cumulativePnl / totalTrades : null;
    const winRate = totalTrades > 0 ? wins / totalTrades : null;

    const enriched = predictions.map((p) => ({
      ...p,
      trade: tradeByPredId.get(p.id) ?? null,
    }));

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        params: { days, limit },
        stats: {
          totalPredictions,
          judgedPredictions,
          trueCount,
          falseCount,
          tieCount,
          naCount,
          accuracy,
          totalTrades,
          cumulativePnl,
          avgPnl,
          winRate,
        },
        predictions: enriched,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

