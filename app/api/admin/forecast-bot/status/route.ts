import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { fetchQuoteForProvider, getPriceFeedProvider } from '@/lib/priceFeed';
import { sourceForProvider } from '@/lib/adminForecastBot/minuteForecastBot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

type Pred = any;
type Trade = any;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const url = new URL(request.url);
    const days = clampInt(Number(url.searchParams.get('days') ?? 7), 1, 30);
    const limit = clampInt(Number(url.searchParams.get('limit') ?? 200), 1, 1000);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: preds, error: pErr } = await supabase
      .from('admin_30s_predictions')
      .select('*')
      .gte('p0_at', since)
      .order('p0_at', { ascending: false })
      .limit(limit);

    if (pErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: pErr.message }, { status: 500 }));

    const predictions = (preds || []) as Pred[];
    const ids = predictions.map((p) => p.id).filter(Boolean);

    const tradeByPredId = new Map<string, Trade>();
    if (ids.length > 0) {
      const { data: trades, error: tErr } = await supabase
        .from('admin_30s_trades')
        .select('*')
        .in('prediction_id', ids);
      if (!tErr && trades) {
        for (const t of trades as Trade[]) tradeByPredId.set((t as any).prediction_id, t);
      }
    }

    // KPIs (match list route rules): exclude NA, exclude TIE from accuracy, exclude LATE trades from KPIs.
    const totalPredictions = predictions.length;
    let signalCount = 0;
    let staleCount = 0;
    let judgedPredictions = 0;
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
      const dir = String((p as any).predicted_direction || '');
      if (dir === 'UP' || dir === 'DOWN') signalCount += 1;
      if (dir === 'STALE') staleCount += 1;

      const trade = tradeByPredId.get(String((p as any).id));
      const isLate = trade?.trade_status === 'LATE';

      const res = (p as any).result as string | null;
      if (dir === 'STALE' || res === 'NA') {
        naCount += 1;
      } else if (res === 'TRUE') {
        if (!isLate) {
          judgedPredictions += 1;
          trueCount += 1;
        }
      } else if (res === 'FALSE') {
        if (!isLate) {
          judgedPredictions += 1;
          falseCount += 1;
        }
      } else if (res === 'TIE') {
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

    const denomAccuracy = trueCount + falseCount;
    const accuracy = denomAccuracy > 0 ? trueCount / denomAccuracy : null;
    const avgPnlOK = totalTradesOK > 0 ? cumulativePnlOK / totalTradesOK : null;
    const winRateOK = totalTradesOK > 0 ? winsOK / totalTradesOK : null;
    const signalRate = totalPredictions > 0 ? signalCount / totalPredictions : null;
    const staleRate = totalPredictions > 0 ? staleCount / totalPredictions : null;
    const avgHoldSecondsOK = totalTradesOK > 0 ? sumHoldOK / totalTradesOK : null;
    const avgAbsExitSlippageMsOK = totalTradesOK > 0 ? sumAbsSlipOK / totalTradesOK : null;

    const enriched = predictions.map((p) => ({
      ...p,
      trade: tradeByPredId.get(String((p as any).id)) ?? null,
    }));

    const provider = getPriceFeedProvider();
    const source = sourceForProvider(provider);

    let latestQuote: any = null;
    try {
      const q = await fetchQuoteForProvider(provider);
      const nowMs = Date.now();
      const missingTimestamp = Boolean(q.missingTimestamp);
      const isStale = !missingTimestamp && nowMs - q.timestampMs > 120_000;
      latestQuote = { price: q.price, quoteTimestampMs: q.timestampMs, provider: q.provider, missingTimestamp, isStale };
    } catch {
      // optional
    }

    const latestPrediction = enriched[0] ?? null;

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        serverAsOf: new Date().toISOString(),
        params: { days, limit },
        provider,
        source,
        latestQuote,
        latestPrediction,
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

