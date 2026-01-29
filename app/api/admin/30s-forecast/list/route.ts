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
  due_at: string | null;
  hold_seconds: number | null;
  exit_slippage_ms: number | null;
  trade_status: 'OK' | 'LATE' | null;
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

    // Stats (exclude NA + exclude TIE from accuracy, exclude LATE trades from KPIs)
    const totalPredictions = predictions.length;
    let signalCount = 0;
    let staleCount = 0;

    let judgedPredictions = 0; // TRUE/FALSE/TIE (excluding NA) and excluding LATE
    let trueCount = 0;
    let falseCount = 0;
    let tieCount = 0;
    let naCount = 0;

    let totalTradesOK = 0;
    let totalTradesLate = 0;
    let cumulativePnlOK = 0;
    let winsOK = 0;
    let sumHoldOK = 0;
    let sumAbsSlipOK = 0;

    for (const p of predictions) {
      if (p.predicted_direction === 'UP' || p.predicted_direction === 'DOWN') signalCount += 1;
      if (p.predicted_direction === 'STALE') staleCount += 1;

      const trade = tradeByPredId.get(p.id);
      const isLate = trade?.trade_status === 'LATE';

      if (p.predicted_direction === 'STALE' || p.result === 'NA') {
        naCount += 1;
        // no trade expected
      } else if (p.result === 'TRUE') {
        if (!isLate) {
          judgedPredictions += 1;
          trueCount += 1;
        }
      } else if (p.result === 'FALSE') {
        if (!isLate) {
          judgedPredictions += 1;
          falseCount += 1;
        }
      } else if (p.result === 'TIE') {
        if (!isLate) {
          judgedPredictions += 1;
          tieCount += 1;
        }
      }

      if (trade) {
        if (trade.trade_status === 'LATE') {
          totalTradesLate += 1;
        } else {
          totalTradesOK += 1;
          const pnl = Number(trade.pnl_usd) || 0;
          cumulativePnlOK += pnl;
          if (pnl > 0) winsOK += 1;
          if (typeof trade.hold_seconds === 'number' && isFinite(trade.hold_seconds)) sumHoldOK += trade.hold_seconds;
          if (typeof trade.exit_slippage_ms === 'number' && isFinite(trade.exit_slippage_ms)) sumAbsSlipOK += Math.abs(trade.exit_slippage_ms);
        }
      }
    }

    const denomAccuracy = trueCount + falseCount; // exclude ties & NA
    const accuracy = denomAccuracy > 0 ? trueCount / denomAccuracy : null;
    const avgPnlOK = totalTradesOK > 0 ? cumulativePnlOK / totalTradesOK : null;
    const winRateOK = totalTradesOK > 0 ? winsOK / totalTradesOK : null;
    const signalRate = totalPredictions > 0 ? signalCount / totalPredictions : null;
    const staleRate = totalPredictions > 0 ? staleCount / totalPredictions : null;
    const avgHoldSecondsOK = totalTradesOK > 0 ? sumHoldOK / totalTradesOK : null;
    const avgAbsExitSlippageMsOK = totalTradesOK > 0 ? sumAbsSlipOK / totalTradesOK : null;

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
          signalRate,
          staleRate,
          judgedPredictions,
          trueCount,
          falseCount,
          tieCount,
          naCount,
          accuracy,
          totalTradesOK,
          totalTradesLate,
          cumulativePnlOK,
          avgPnlOK,
          winRateOK,
          avgHoldSecondsOK,
          avgAbsExitSlippageMsOK,
        },
        predictions: enriched,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

