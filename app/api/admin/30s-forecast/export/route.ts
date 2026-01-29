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

    // Summary stats
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

    const denom = trueCount + falseCount;
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
      { header: 'source', key: 'source', width: 14 },
      { header: 'delta', key: 'delta', width: 12 },
      { header: 'threshold', key: 'threshold', width: 12 },
      { header: 'volatility', key: 'volatility', width: 12 },
    ];

    for (const p of predictions) {
      const meta = (p.meta || {}) as any;
      sheetPred.addRow({
        p0_at: p.p0_at,
        due_at: p.due_at,
        validated_at: p.validated_at ?? '',
        predicted_direction: p.predicted_direction,
        p0: asNum(p.p0),
        p1: asNum(p.p1),
        result: p.result ?? '',
        source: p.source ?? '',
        delta: asNum(meta.delta),
        threshold: asNum(meta.threshold),
        volatility: asNum(meta.volatility),
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
    sheetSummary.addRow({ metric: 'days', value: days });
    sheetSummary.addRow({ metric: 'total_predictions', value: predictions.length });
    sheetSummary.addRow({ metric: 'true', value: trueCount });
    sheetSummary.addRow({ metric: 'false', value: falseCount });
    sheetSummary.addRow({ metric: 'tie', value: tieCount });
    sheetSummary.addRow({ metric: 'na', value: naCount });
    sheetSummary.addRow({ metric: 'accuracy_excl_ties', value: accuracy ?? '' });
    sheetSummary.addRow({ metric: 'total_trades', value: trades.length });
    sheetSummary.addRow({ metric: 'cumulative_pnl_usd', value: cumulativePnl });
    sheetSummary.addRow({ metric: 'avg_pnl_usd', value: avgPnl ?? '' });
    sheetSummary.addRow({ metric: 'win_rate', value: winRate ?? '' });

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

