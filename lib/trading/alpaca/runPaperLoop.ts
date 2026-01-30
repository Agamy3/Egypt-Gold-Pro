import 'server-only';

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAccount, getOrders, getPositions, placeBracketOrder } from '@/lib/brokers/alpacaPaper';
import { decideActions } from '@/lib/trading/strategy/decide';

const LOCK_LEASE_SECONDS = 110;

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function runAlpacaPaperLoop(supabase: SupabaseClient, now = new Date()) {
  const nowIso = now.toISOString();
  // Row-based lease lock (prevents overlapping runs and can't get stuck indefinitely).
  const lockToken = randomUUID();
  const lockUntilIso = new Date(now.getTime() + LOCK_LEASE_SECONDS * 1000).toISOString();
  try {
    const { data: lockedRow, error: lockErr } = await supabase
      .from('alpaca_paper_state')
      .update({ run_lock_until: lockUntilIso, run_lock_token: lockToken, updated_at: nowIso })
      .eq('key', 'default')
      .or(`run_lock_until.is.null,run_lock_until.lt.${nowIso}`)
      .select('run_lock_token')
      .maybeSingle();

    if (lockErr) return { ok: false as const, error: lockErr.message };
    if (!lockedRow || (lockedRow as any).run_lock_token !== lockToken) {
      return { ok: true as const, skipped: true, reason: 'lock_not_acquired', serverAsOf: nowIso };
    }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const { data: settings, error: sErr } = await supabase
      .from('alpaca_paper_settings')
      .select('*')
      .eq('key', 'default')
      .maybeSingle();
    if (sErr) return { ok: false as const, error: sErr.message };
    const st = settings as any;
    const enabled = Boolean(st?.enabled);
    const intervalSeconds = clampInt(Number(st?.interval_seconds ?? 60), 60, 300);

    const { data: stateRow } = await supabase.from('alpaca_paper_state').select('*').eq('key', 'default').maybeSingle();
    const state = (stateRow as any) ?? { key: 'default' };

    if (!enabled) {
      return { ok: true as const, serverAsOf: nowIso, skipped: true, reason: 'disabled', settings: st ?? null, state };
    }
    if (state?.halted) {
      return { ok: true as const, serverAsOf: nowIso, skipped: true, reason: 'halted', settings: st ?? null, state };
    }

    const lastRunAt = state?.last_run_at ? Date.parse(String(state.last_run_at)) : null;
    if (lastRunAt && now.getTime() - lastRunAt < intervalSeconds * 1000) {
      return { ok: true as const, serverAsOf: nowIso, skipped: true, reason: 'interval_not_elapsed', settings: st ?? null, state };
    }

    const runId = randomUUID();

    const [account, positions] = await Promise.all([getAccount(), getPositions()]);

    const equity = num(account.equity) ?? 0;
    const lastEquity = num((account as any).last_equity) ?? null;
    const maxDD = num(st?.max_daily_drawdown_pct) ?? 0.05;
    if (lastEquity != null && lastEquity > 0) {
      const dd = (lastEquity - equity) / lastEquity;
      if (dd >= maxDD) {
        await supabase
          .from('alpaca_paper_state')
          .upsert(
            {
              key: 'default',
              halted: true,
              halted_reason: `drawdown_exceeded:${(dd * 100).toFixed(2)}%`,
              last_run_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );
        await supabase.from('alpaca_paper_settings').upsert({ key: 'default', enabled: false, updated_at: nowIso }, { onConflict: 'key' });
        return { ok: true as const, serverAsOf: nowIso, halted: true, haltedReason: `drawdown_exceeded:${dd}` };
      }
    }

    const universe = Array.isArray(st?.universe) ? st.universe.map(String) : [];
    const maxRisk = Math.min(Math.max(Number(st?.max_risk_per_trade_pct ?? 0.02), 0), 0.02);

    const decision = await decideActions({
      universe,
      account,
      positions,
      maxRiskPerTradePct: maxRisk,
    });

    // Process newly filled SELL orders since last run (best-effort allocation)
    const after = state?.last_run_at ? String(state.last_run_at) : undefined;
    const recentOrders = await getOrders({ status: 'closed', limit: 200, after }).catch(() => []);
    const filledSells = recentOrders.filter((o) => o.side === 'sell' && (o.status === 'filled' || o.status === 'partially_filled'));
    const existingOrderIds = new Set(
      (
        await supabase.from('alpaca_paper_trades').select('order_id').not('order_id', 'is', null).limit(1000)
      ).data?.map((r: any) => String(r.order_id)) ?? []
    );

    for (const o of filledSells) {
      if (!o.id || existingOrderIds.has(o.id)) continue;
      const qty = num(o.qty) ?? 0;
      const exit = num(o.filled_avg_price) ?? null;
      const filledAt = o.filled_at ?? null;

      // Try to find latest BUY log for symbol to estimate entry
      const { data: priorBuys } = await supabase
        .from('alpaca_paper_trades')
        .select('id, entry_price, qty')
        .eq('symbol', o.symbol)
        .eq('side', 'BUY')
        .order('created_at', { ascending: false })
        .limit(1);
      const entry = priorBuys && priorBuys[0] ? num((priorBuys[0] as any).entry_price) : null;
      const pnl = entry != null && exit != null ? (exit - entry) * qty : null;

      const { data: sellTrade } = await supabase
        .from('alpaca_paper_trades')
        .insert({
          run_id: runId,
          symbol: o.symbol,
          side: 'SELL',
          qty,
          entry_price: entry,
          order_id: o.id,
          status: 'filled',
          filled_avg_price: exit,
          filled_at: filledAt,
          pnl,
          meta: { source: 'alpaca_orders_sync' },
        })
        .select('id')
        .single();

      if (pnl != null && pnl > 0 && sellTrade?.id) {
        const reserveAmt = pnl * 0.25;
        const longTermAmt = pnl * 0.25;
        await supabase.from('alpaca_reserve_ledger').insert({
          amount: reserveAmt,
          reason: '25pct_profit_allocation',
          source_trade_id: sellTrade.id,
        });
        await supabase
          .from('alpaca_paper_state')
          .upsert(
            {
              key: 'default',
              reserved_cash: (num(state?.reserved_cash) ?? 0) + reserveAmt,
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );

        // Virtual long-term buy at exit price
        if (exit != null && exit > 0) {
          await supabase.from('alpaca_long_term_holdings').insert({
            symbol: o.symbol,
            qty: longTermAmt / exit,
            avg_price: exit,
            source_trade_id: sellTrade.id,
          });
        }
      }
    }

    const placed: any[] = [];
    for (const a of decision.actions) {
      if (a.type !== 'BUY_BRACKET') continue;
      try {
        const order = await placeBracketOrder({
          symbol: a.symbol,
          qty: a.qty,
          side: 'BUY',
          stopLoss: a.stopLoss,
          takeProfit: a.takeProfit,
        });

        const meta = {
          score: a.score,
          confidence0to1: a.confidence0to1,
          reasons: a.reasons,
          indicators: a.indicators,
          alpaca: { orderId: order.id, legs: order.legs?.map((l) => ({ id: l.id, side: l.side, status: l.status })) ?? [] },
        };

        const { data: tradeRow } = await supabase
          .from('alpaca_paper_trades')
          .insert({
            run_id: runId,
            symbol: a.symbol,
            side: 'BUY',
            qty: a.qty,
            entry_price: a.entryPrice,
            stop_loss: a.stopLoss,
            take_profit: a.takeProfit,
            order_id: order.id,
            status: String(order.status || 'submitted'),
            meta,
          })
          .select('*')
          .single();

        placed.push({ action: a, orderId: order.id, tradeId: tradeRow?.id ?? null });
      } catch (e) {
        await supabase.from('alpaca_paper_trades').insert({
          run_id: runId,
          symbol: a.symbol,
          side: 'BUY',
          qty: a.qty,
          entry_price: a.entryPrice,
          stop_loss: a.stopLoss,
          take_profit: a.takeProfit,
          order_id: null,
          status: 'error',
          meta: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }

    // Snapshot positions for history
    await supabase.from('alpaca_paper_positions_snapshot').insert({ positions: positions as any });

    await supabase
      .from('alpaca_paper_state')
      .upsert(
        {
          key: 'default',
          last_run_at: nowIso,
          last_run_minute_key: nowIso.slice(0, 16) + 'Z',
          updated_at: nowIso,
        },
        { onConflict: 'key' }
      );

    return {
      ok: true as const,
      serverAsOf: nowIso,
      runId,
      placedCount: placed.length,
      placed,
      considered: decision.considered,
      intervalSeconds,
    };
  } finally {
    // Best-effort unlock; lock also expires automatically by run_lock_until.
    await supabase
      .from('alpaca_paper_state')
      .update({ run_lock_until: nowIso, run_lock_token: null, updated_at: nowIso })
      .eq('key', 'default')
      .eq('run_lock_token', lockToken);
  }
}

