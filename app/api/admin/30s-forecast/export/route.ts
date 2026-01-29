import { NextResponse } from 'next/server';

import ExcelJS from 'exceljs';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { dynamic, revalidate, withNoStoreHeaders } from '../_util';

export { dynamic, revalidate };

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function cellNum(x: unknown): number | '' {
  const n = asNum(x);
  return n == null ? '' : n;
}

function cellText(x: unknown): string {
  if (x == null) return '';
  const s = String(x);
  return s === 'null' || s === 'undefined' ? '' : s;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const supabaseAdmin = getServerClient();

    const url = new URL(request.url);
    const days = clampInt(Number(url.searchParams.get('days') ?? 7), 1, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: preds, error: pErr } = await supabaseAdmin
      .from('admin_30s_predictions')
      .select('*')
      .gte('p0_at', since)
      .order('p0_at', { ascending: false })
      .limit(5000);

    if (pErr) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: pErr.message }, { status: 500 }));
    }

    const predictions = (preds || []) as any[];
    const ids = predictions.map((p) => p.id).filter(Boolean);

    let trades: any[] = [];
    if (ids.length > 0) {
      const { data: t, error: tErr } = await supabaseAdmin
        .from('admin_30s_trades')
        .select('*')
        .in('prediction_id', ids);
      if (!tErr && t) trades = t as any[];
    }

    // Keep legacy aggregates, but KPIs for export will be based on OK trades only (computed below).
    const cumulativePnl = trades.reduce((sum, t) => sum + (asNum(t.pnl_usd) ?? 0), 0);
    const avgPnl = trades.length > 0 ? cumulativePnl / trades.length : null;
    const wins = trades.reduce((sum, t) => sum + ((asNum(t.pnl_usd) ?? 0) > 0 ? 1 : 0), 0);
    const winRate = trades.length > 0 ? wins / trades.length : null;

    // Workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EgyptGold Pro';
    wb.created = new Date();

    const sheetPred = wb.addWorksheet('Predictions');
    sheetPred.columns = [
      { header: 'p0_at', key: 'p0_at', width: 24 },
      { header: 'due_at', key: 'due_at', width: 24 },
      { header: 'validated_at', key: 'validated_at', width: 24 },
      { header: 'horizon_seconds', key: 'horizon_seconds', width: 14 },
      { header: 'predicted_direction', key: 'predicted_direction', width: 12 },
      { header: 'p0', key: 'p0', width: 12 },
      { header: 'p1', key: 'p1', width: 12 },
      { header: 'result', key: 'result', width: 10 },
      { header: 'source', key: 'source', width: 18 },
      { header: 'predicted_delta', key: 'predicted_delta', width: 14 },
      { header: 'predicted_price', key: 'predicted_price', width: 14 },
      { header: 'confidence', key: 'confidence', width: 12 },
      { header: 'expected_low', key: 'expected_low', width: 14 },
      { header: 'expected_high', key: 'expected_high', width: 14 },
      { header: 'price_error', key: 'price_error', width: 12 },
      { header: 'range_hit', key: 'range_hit', width: 10 },
      { header: 'delta', key: 'delta', width: 12 },
      { header: 'volMedian', key: 'volMedian', width: 12 },
      { header: 'threshold', key: 'threshold', width: 12 },
      { header: 'provider', key: 'provider', width: 14 },
      { header: 'quoteTimestampMs', key: 'quoteTimestampMs', width: 16 },
      { header: 'staleAgeSec', key: 'staleAgeSec', width: 12 },
    ];

    const totalPredictions = predictions.length;
    const tradeByPredId = new Map<string, any>();
    for (const t of trades) {
      const pid = String(t.prediction_id || '');
      if (pid) tradeByPredId.set(pid, t);
    }

    let staleOrNA = 0;
    let judgedCount = 0;
    let signalCount = 0;
    let rangeHitCount = 0;
    let rangeHitEligible = 0;
    let trueCount = 0;
    let falseCount = 0;
    let tieCount = 0;
    let naCount = 0;

    for (const p of predictions) {
      const meta = (p.meta || {}) as any;
      const predicted = String(p.predicted_direction || '');
      const isSignal = predicted === 'UP' || predicted === 'DOWN';
      if (isSignal) signalCount += 1;

      // Defensive: export NA for STALE even if DB result isn't set yet.
      const resultExport = predicted === 'STALE' ? (p.result ?? 'NA') : (p.result ?? '');
      const isNA = resultExport === 'NA' || predicted === 'STALE';
      if (isNA) {
        staleOrNA += 1;
        naCount += 1;
      }

      const trade = tradeByPredId.get(String(p.id));
      const isLate = trade?.trade_status === 'LATE';

      const isJudged = resultExport === 'TRUE' || resultExport === 'FALSE' || resultExport === 'TIE';
      if (isJudged && !isLate) {
        judgedCount += 1;
        if (resultExport === 'TRUE') trueCount += 1;
        else if (resultExport === 'FALSE') falseCount += 1;
        else if (resultExport === 'TIE') tieCount += 1;
      }

      const hasBounds = p.expected_low != null && p.expected_high != null;
      if (!isNA && p.validated_at && hasBounds) {
        rangeHitEligible += 1;
        if (p.range_hit === true) rangeHitCount += 1;
      }

      sheetPred.addRow({
        p0_at: cellText(p.p0_at),
        due_at: cellText(p.due_at),
        validated_at: cellText(p.validated_at),
        horizon_seconds: cellNum(p.horizon_seconds),
        predicted_direction: predicted,
        p0: cellNum(p.p0),
        p1: cellNum(p.p1),
        result: cellText(resultExport),
        source: cellText(p.source),
        predicted_delta: cellNum(p.predicted_delta),
        predicted_price: cellNum(p.predicted_price),
        confidence: cellNum(p.confidence),
        expected_low: cellNum(p.expected_low),
        expected_high: cellNum(p.expected_high),
        price_error: cellNum(p.price_error),
        range_hit: p.range_hit == null ? '' : String(Boolean(p.range_hit)),
        delta: cellNum(meta.deltaObserved ?? meta.delta),
        volMedian: cellNum(meta.volMedian),
        threshold: cellNum(meta.threshold),
        provider: cellText(meta.provider),
        quoteTimestampMs: cellNum(meta.quoteTimestampMs),
        staleAgeSec: cellNum(meta.staleAgeSec),
      });
    }

    const sheetTrades = wb.addWorksheet('Trades');
    sheetTrades.columns = [
      { header: 'closed_at', key: 'closed_at', width: 24 },
      { header: 'due_at', key: 'due_at', width: 24 },
      { header: 'hold_seconds', key: 'hold_seconds', width: 14 },
      { header: 'exit_slippage_ms', key: 'exit_slippage_ms', width: 16 },
      { header: 'trade_status', key: 'trade_status', width: 10 },
      { header: 'side', key: 'side', width: 10 },
      { header: 'notional_usd', key: 'notional_usd', width: 14 },
      { header: 'qty_oz', key: 'qty_oz', width: 12 },
      { header: 'entry_price', key: 'entry_price', width: 14 },
      { header: 'exit_price', key: 'exit_price', width: 14 },
      { header: 'pnl_usd', key: 'pnl_usd', width: 12 },
      { header: 'prediction_id', key: 'prediction_id', width: 38 },
    ];

    let totalTradesOK = 0;
    let totalTradesLate = 0;
    let cumulativePnlOK = 0;
    let winsOK = 0;
    let sumHoldOK = 0;
    let sumAbsSlipOK = 0;

    for (const t of trades) {
      const status = (t.trade_status as string | null) ?? null;
      const pnl = asNum(t.pnl_usd) ?? 0;
      if (status === 'LATE') {
        totalTradesLate += 1;
      } else {
        totalTradesOK += 1;
        cumulativePnlOK += pnl;
        if (pnl > 0) winsOK += 1;
        const hs = asNum(t.hold_seconds);
        if (hs != null) sumHoldOK += hs;
        const slip = asNum(t.exit_slippage_ms);
        if (slip != null) sumAbsSlipOK += Math.abs(slip);
      }

      sheetTrades.addRow({
        closed_at: t.closed_at,
        due_at: cellText(t.due_at),
        hold_seconds: cellNum(t.hold_seconds),
        exit_slippage_ms: cellNum(t.exit_slippage_ms),
        trade_status: cellText(t.trade_status),
        side: t.side,
        notional_usd: cellNum(t.notional_usd),
        qty_oz: cellNum(t.qty_oz),
        entry_price: cellNum(t.entry_price),
        exit_price: cellNum(t.exit_price),
        pnl_usd: cellNum(t.pnl_usd),
        prediction_id: t.prediction_id,
      });
    }

    const sheetSummary = wb.addWorksheet('Summary');
    sheetSummary.columns = [
      { header: 'metric', key: 'metric', width: 26 },
      { header: 'value', key: 'value', width: 20 },
    ];
    const signalRate = totalPredictions > 0 ? signalCount / totalPredictions : null;
    const staleRate = totalPredictions > 0 ? staleOrNA / totalPredictions : null;
    const denomAccuracy = trueCount + falseCount; // exclude ties & NA, and exclude LATE via counting above
    const accuracy = denomAccuracy > 0 ? trueCount / denomAccuracy : null;
    const winRateOK = totalTradesOK > 0 ? winsOK / totalTradesOK : null;
    const avgPnlOK = totalTradesOK > 0 ? cumulativePnlOK / totalTradesOK : null;
    const avgHoldSecondsOK = totalTradesOK > 0 ? sumHoldOK / totalTradesOK : null;
    const avgAbsExitSlippageMsOK = totalTradesOK > 0 ? sumAbsSlipOK / totalTradesOK : null;
    const rangeHitRate = rangeHitEligible > 0 ? rangeHitCount / rangeHitEligible : null;

    sheetSummary.addRow({ metric: 'days', value: days });
    sheetSummary.addRow({ metric: 'totalPredictions', value: totalPredictions });
    sheetSummary.addRow({ metric: 'signalRate', value: signalRate ?? '' });
    sheetSummary.addRow({ metric: 'staleRate', value: staleRate ?? '' });
    sheetSummary.addRow({ metric: 'judgedPredictions(TRUE/FALSE/TIE)', value: judgedCount });
    sheetSummary.addRow({ metric: 'trueCount', value: trueCount });
    sheetSummary.addRow({ metric: 'falseCount', value: falseCount });
    sheetSummary.addRow({ metric: 'tieCount', value: tieCount });
    sheetSummary.addRow({ metric: 'accuracy(excl NA & TIE)', value: accuracy ?? '' });
    sheetSummary.addRow({ metric: 'totalTradesOK', value: totalTradesOK });
    sheetSummary.addRow({ metric: 'totalTradesLate', value: totalTradesLate });
    sheetSummary.addRow({ metric: 'winRateOK', value: winRateOK ?? '' });
    sheetSummary.addRow({ metric: 'cumulativePnlOK', value: cumulativePnlOK });
    sheetSummary.addRow({ metric: 'avgPnlOK', value: avgPnlOK ?? '' });
    sheetSummary.addRow({ metric: 'avgHoldSecondsOK', value: avgHoldSecondsOK ?? '' });
    sheetSummary.addRow({ metric: 'avgAbsExitSlippageMsOK', value: avgAbsExitSlippageMsOK ?? '' });
    sheetSummary.addRow({ metric: 'rangeHitRate', value: rangeHitRate ?? '' });

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const nodeBuf = Buffer.from(buf);

    const filename = `admin-30s-forecast-last-${days}-days.xlsx`;
    const res = new NextResponse(nodeBuf, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    return withNoStoreHeaders(res);
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

