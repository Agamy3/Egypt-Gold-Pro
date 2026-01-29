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

    // Summary stats (accuracy excludes NA and excludes TIE)
    let trueCount = 0;
    let falseCount = 0;
    let tieCount = 0;
    let naCount = 0;

    for (const p of predictions) {
      const r = p.result as string | null;
      if (r === 'TRUE') trueCount += 1;
      else if (r === 'FALSE') falseCount += 1;
      else if (r === 'TIE') tieCount += 1;
      else if (r === 'NA') naCount += 1;
    }

    const denom = trueCount + falseCount; // exclude ties & NA
    const accuracy = denom > 0 ? trueCount / denom : null;

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
      { header: 'predicted_direction', key: 'predicted_direction', width: 12 },
      { header: 'p0', key: 'p0', width: 12 },
      { header: 'p1', key: 'p1', width: 12 },
      { header: 'result', key: 'result', width: 10 },
      { header: 'source', key: 'source', width: 18 },
      { header: 'delta', key: 'delta', width: 12 },
      { header: 'volMedian', key: 'volMedian', width: 12 },
      { header: 'threshold', key: 'threshold', width: 12 },
      { header: 'provider', key: 'provider', width: 14 },
      { header: 'quoteTimestampMs', key: 'quoteTimestampMs', width: 16 },
      { header: 'staleAgeSec', key: 'staleAgeSec', width: 12 },
    ];

    let staleOrNA = 0;
    let judgedCount = 0;
    let signalCount = 0;

    for (const p of predictions) {
      const meta = (p.meta || {}) as any;
      const predicted = String(p.predicted_direction || '');
      const isSignal = predicted === 'UP' || predicted === 'DOWN';
      if (isSignal) signalCount += 1;

      // Defensive: export NA for STALE even if DB result isn't set yet.
      const resultExport = predicted === 'STALE' ? (p.result ?? 'NA') : (p.result ?? '');
      const isNA = resultExport === 'NA' || predicted === 'STALE';
      if (isNA) staleOrNA += 1;
      const isJudged = resultExport === 'TRUE' || resultExport === 'FALSE' || resultExport === 'TIE';
      if (isJudged) judgedCount += 1;

      sheetPred.addRow({
        p0_at: cellText(p.p0_at),
        due_at: cellText(p.due_at),
        validated_at: cellText(p.validated_at),
        predicted_direction: predicted,
        p0: cellNum(p.p0),
        p1: cellNum(p.p1),
        result: cellText(resultExport),
        source: cellText(p.source),
        delta: cellNum(meta.delta),
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
      { header: 'side', key: 'side', width: 10 },
      { header: 'notional_usd', key: 'notional_usd', width: 14 },
      { header: 'qty_oz', key: 'qty_oz', width: 12 },
      { header: 'entry_price', key: 'entry_price', width: 14 },
      { header: 'exit_price', key: 'exit_price', width: 14 },
      { header: 'pnl_usd', key: 'pnl_usd', width: 12 },
      { header: 'prediction_id', key: 'prediction_id', width: 38 },
    ];

    for (const t of trades) {
      sheetTrades.addRow({
        closed_at: t.closed_at,
        side: t.side,
        notional_usd: asNum(t.notional_usd),
        qty_oz: asNum(t.qty_oz),
        entry_price: asNum(t.entry_price),
        exit_price: asNum(t.exit_price),
        pnl_usd: asNum(t.pnl_usd),
        prediction_id: t.prediction_id,
      });
    }

    const sheetSummary = wb.addWorksheet('Summary');
    sheetSummary.columns = [
      { header: 'metric', key: 'metric', width: 26 },
      { header: 'value', key: 'value', width: 20 },
    ];
    const tradesPerDay = days > 0 ? trades.length / days : null;
    const signalRate = predictions.length > 0 ? signalCount / predictions.length : null;

    sheetSummary.addRow({ metric: 'days', value: days });
    sheetSummary.addRow({ metric: 'totalPredictions', value: predictions.length });
    sheetSummary.addRow({ metric: 'staleCount(NA)', value: staleOrNA });
    sheetSummary.addRow({ metric: 'judgedCount(TRUE/FALSE/TIE)', value: judgedCount });
    sheetSummary.addRow({ metric: 'trueCount', value: trueCount });
    sheetSummary.addRow({ metric: 'falseCount', value: falseCount });
    sheetSummary.addRow({ metric: 'tieCount', value: tieCount });
    sheetSummary.addRow({ metric: 'accuracy(excl NA & TIE)', value: accuracy ?? '' });
    sheetSummary.addRow({ metric: 'signalRate(UP/DOWN)', value: signalRate ?? '' });
    sheetSummary.addRow({ metric: 'tradesCount', value: trades.length });
    sheetSummary.addRow({ metric: 'winRate', value: winRate ?? '' });
    sheetSummary.addRow({ metric: 'cumulativePnl', value: cumulativePnl });
    sheetSummary.addRow({ metric: 'avgPnl', value: avgPnl ?? '' });
    sheetSummary.addRow({ metric: 'tradesPerDay', value: tradesPerDay ?? '' });

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

