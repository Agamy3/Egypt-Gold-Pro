'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type StatusResp = {
  ok: boolean;
  error?: string;
  serverAsOf?: string;
  settings?: any;
  state?: any;
  account?: any;
  positions?: any[];
  clock?: any;
  reservedCash?: number;
  longTermValue?: number;
  banner?: string;
};

type TradesResp = { ok: boolean; error?: string; trades?: any[]; serverAsOf?: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'include', ...(init ?? {}) });
  const json = (await res.json()) as any;
  if (!res.ok || json?.ok === false) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

function fmtMoney(n: unknown, digits = 2) {
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return '—';
  return x.toFixed(digits);
}

export default function AlpacaPaperDashboard() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const settings = status?.settings ?? {};

  const universeText = useMemo(() => JSON.stringify(settings?.universe ?? [], null, 2), [settings?.universe]);
  const [universeDraft, setUniverseDraft] = useState<string>(universeText);
  const [intervalDraft, setIntervalDraft] = useState<string>(String(settings?.interval_seconds ?? 60));
  const [riskDraft, setRiskDraft] = useState<string>(String(settings?.max_risk_per_trade_pct ?? 0.02));
  const [ddDraft, setDdDraft] = useState<string>(String(settings?.max_daily_drawdown_pct ?? 0.05));

  // keep drafts in sync on first load / refresh
  useEffect(() => {
    setUniverseDraft(universeText);
    setIntervalDraft(String(settings?.interval_seconds ?? 60));
    setRiskDraft(String(settings?.max_risk_per_trade_pct ?? 0.02));
    setDdDraft(String(settings?.max_daily_drawdown_pct ?? 0.05));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeText]);

  const refresh = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setError(null);
      const [s, t] = await Promise.all([
        fetchJson<StatusResp>('/api/admin/alpaca-paper/status', { signal: ac.signal }),
        fetchJson<TradesResp>('/api/admin/alpaca-paper/trades?limit=200', { signal: ac.signal }),
      ]);
      setStatus(s);
      setTrades(t.trades ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let active = true;
    const safe = async () => {
      if (!active) return;
      await refresh();
    };
    void safe();
    const interval = window.setInterval(() => void safe(), 10_000);
    const onFocus = () => void safe();
    const onVis = () => {
      if (document.visibilityState === 'visible') void safe();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-yellow-800 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-200">
        {status?.banner ?? 'Paper trading (simulated) — no real money.'}
      </div>

      {lastAction && (
        <div className="rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2 text-sm text-gray-200">
          <span className="text-gray-400">Last action:</span> {lastAction}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Account (paper)</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">
              Equity: <span className="text-gray-200">{fmtMoney(status?.account?.equity)}</span>
            </div>
            <div className="text-gray-400">
              Cash: <span className="text-gray-200">{fmtMoney(status?.account?.cash)}</span>
            </div>
            <div className="text-gray-400">
              Buying power: <span className="text-gray-200">{fmtMoney(status?.account?.buying_power)}</span>
            </div>
            <div className="text-gray-400">
              Reserved cash: <span className="text-gray-200">{fmtMoney(status?.reservedCash, 2)}</span>
            </div>
            <div className="text-gray-400">
              Long-term value: <span className="text-gray-200">{fmtMoney(status?.longTermValue, 2)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Status</div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="text-gray-400">
              Market:{' '}
              <span className={`font-semibold ${status?.clock?.is_open ? 'text-emerald-300' : 'text-gray-200'}`}>
                {status?.clock ? (status.clock.is_open ? 'OPEN' : 'CLOSED') : '—'}
              </span>
              {status?.clock?.next_open && !status?.clock?.is_open && (
                <span className="text-xs text-gray-500"> (next open: {String(status.clock.next_open)})</span>
              )}
            </div>
            <div className="text-gray-400">
              Enabled:{' '}
              <span className={`font-semibold ${settings?.enabled ? 'text-emerald-300' : 'text-gray-200'}`}>
                {settings?.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="text-gray-400">
              Halted:{' '}
              <span className={`font-semibold ${status?.state?.halted ? 'text-red-300' : 'text-gray-200'}`}>
                {status?.state?.halted ? 'YES' : 'NO'}
              </span>
            </div>
            {status?.state?.halted_reason && <div className="text-xs text-red-200">Reason: {String(status.state.halted_reason)}</div>}
            <div className="text-gray-400">
              Last run:{' '}
              <span className="text-gray-200">{status?.state?.last_run_at ? String(status.state.last_run_at) : '—'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={running}
                onClick={async () => {
                  try {
                    setError(null);
                    setLastAction(null);
                    setRunning(true);
                    const res = (await fetchJson<any>('/api/admin/alpaca-paper/run', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ force: true }),
                    })) as any;
                    if (res?.skipped) {
                      const extra = res?.lockUntil ? ` (lockUntil=${String(res.lockUntil)})` : res?.nextEligibleAt ? ` (nextEligibleAt=${String(res.nextEligibleAt)})` : '';
                      setLastAction(`run skipped: ${String(res.reason || 'unknown')}${extra}`);
                    } else {
                      setLastAction(
                        `run ok: placed=${String(res.placedCount ?? 0)} considered=${String(res.considered ?? '—')} runId=${String(res.runId ?? '—')}`
                      );
                    }
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setRunning(false);
                  }
                }}
                className="px-3 py-2 rounded-md text-sm font-semibold bg-gold-600 text-black hover:bg-gold-500 disabled:opacity-50"
              >
                Run once now
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  try {
                    setError(null);
                    setLastAction(null);
                    setSaving(true);
                    await fetchJson('/api/admin/alpaca-paper/unlock', { method: 'POST' });
                    setLastAction('lock cleared');
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
              >
                Clear lock
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  try {
                    setError(null);
                    setLastAction(null);
                    setSaving(true);
                    const nextEnabled = !Boolean(settings?.enabled);
                    await fetchJson('/api/admin/alpaca-paper/toggle', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: nextEnabled }),
                    });
                    setLastAction(nextEnabled ? 'strategy enabled' : 'strategy disabled');
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
                className={`px-3 py-2 rounded-md text-sm font-semibold ${
                  settings?.enabled ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-emerald-600 text-black hover:bg-emerald-500'
                } disabled:opacity-50`}
              >
                {settings?.enabled ? 'Stop Strategy' : 'Start Strategy'}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700"
              >
                Refresh
              </button>
            </div>
            <div className="text-xs text-gray-500">Auto-refreshes every ~10s while this page is open.</div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Settings</div>
          <div className="mt-2 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Interval (sec)</span>
              <input value={intervalDraft} onChange={(e) => setIntervalDraft(e.target.value)} className="w-24 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Max risk / trade (≤2%)</span>
              <input value={riskDraft} onChange={(e) => setRiskDraft(e.target.value)} className="w-24 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Max drawdown (≤5%)</span>
              <input value={ddDraft} onChange={(e) => setDdDraft(e.target.value)} className="w-24 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200" />
            </label>
            <div>
              <div className="text-gray-400 mb-1">Universe (JSON array)</div>
              <textarea
                value={universeDraft}
                onChange={(e) => setUniverseDraft(e.target.value)}
                className="w-full h-28 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200 font-mono text-xs"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                try {
                  setError(null);
                  setLastAction(null);
                  setSaving(true);
                  await fetchJson('/api/admin/alpaca-paper/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      interval_seconds: Number(intervalDraft),
                      max_risk_per_trade_pct: Number(riskDraft),
                      max_daily_drawdown_pct: Number(ddDraft),
                      universe: universeDraft,
                    }),
                  });
                  setLastAction('settings saved');
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSaving(false);
                }
              }}
              className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              Save settings
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!window.confirm('Reset strategy settings to defaults and clear halted/lock state?')) return;
                try {
                  setError(null);
                  setLastAction(null);
                  setSaving(true);
                  await fetchJson('/api/admin/alpaca-paper/reset', { method: 'POST' });
                  setLastAction('settings reset');
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSaving(false);
                }
              }}
              className="px-3 py-2 rounded-md text-sm font-semibold bg-red-900/60 text-red-100 hover:bg-red-900 disabled:opacity-50"
            >
              Reset settings
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">Open positions (Alpaca)</div>
          <div className="text-xs text-gray-400">Showing {status?.positions?.length ?? 0} rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">symbol</th>
                <th className="text-left px-4 py-2">qty</th>
                <th className="text-left px-4 py-2">avg</th>
                <th className="text-left px-4 py-2">mv</th>
                <th className="text-left px-4 py-2">uPnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(status?.positions ?? []).map((p: any) => (
                <tr key={p.symbol} className="text-gray-200">
                  <td className="px-4 py-2">{p.symbol}</td>
                  <td className="px-4 py-2">{p.qty}</td>
                  <td className="px-4 py-2">{p.avg_entry_price}</td>
                  <td className="px-4 py-2">{p.market_value}</td>
                  <td className="px-4 py-2">{p.unrealized_pl}</td>
                </tr>
              ))}
              {(status?.positions ?? []).length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-400" colSpan={5}>
                    No open positions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">Recent trades (internal log)</div>
          <div className="text-xs text-gray-400">Showing {trades.length} rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">time</th>
                <th className="text-left px-4 py-2">symbol</th>
                <th className="text-left px-4 py-2">side</th>
                <th className="text-left px-4 py-2">qty</th>
                <th className="text-left px-4 py-2">entry</th>
                <th className="text-left px-4 py-2">stop</th>
                <th className="text-left px-4 py-2">tp</th>
                <th className="text-left px-4 py-2">status</th>
                <th className="text-left px-4 py-2">error</th>
                <th className="text-left px-4 py-2">pnl</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {trades.map((t: any) => (
                <tr key={t.id} className="text-gray-200">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{t.created_at}</td>
                  <td className="px-4 py-2">{t.symbol}</td>
                  <td className="px-4 py-2 font-semibold">{t.side}</td>
                  <td className="px-4 py-2">{t.qty}</td>
                  <td className="px-4 py-2">{t.entry_price ?? '—'}</td>
                  <td className="px-4 py-2">{t.stop_loss ?? '—'}</td>
                  <td className="px-4 py-2">{t.take_profit ?? '—'}</td>
                  <td className="px-4 py-2">{t.status}</td>
                  <td className="px-4 py-2 text-xs text-red-200/90">{t?.meta?.error ? String(t.meta.error) : '—'}</td>
                  <td className="px-4 py-2">{t.pnl ?? '—'}</td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-400" colSpan={10}>
                    No trades yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

