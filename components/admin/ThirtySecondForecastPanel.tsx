'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ListResponse = {
  ok: boolean;
  error?: string;
  serverAsOf?: string;
  latestQuote?: { price: number; quoteTimestampMs: number; provider: string; missingTimestamp: boolean; isStale: boolean } | null;
  latestPrediction?: any | null;
  stats?: {
    totalPredictions: number;
    signalRate?: number | null;
    staleRate?: number | null;
    judgedPredictions: number;
    trueCount: number;
    falseCount: number;
    tieCount: number;
    naCount: number;
    accuracy: number | null;
    totalTradesOK?: number;
    totalTradesLate?: number;
    cumulativePnlOK?: number;
    avgPnlOK?: number | null;
    winRateOK?: number | null;
    avgHoldSecondsOK?: number | null;
    avgAbsExitSlippageMsOK?: number | null;
  };
  predictions?: any[];
};

type BotSettingsResponse =
  | { ok: true; tradingEnabled: boolean; predictionHorizonMinutes: number; tradeFrequencyMinutes: number; updatedAt: string | null }
  | { ok: false; error: string };

async function getStatus(days = 7, limit = 200, signal?: AbortSignal) {
  const url = `/api/admin/forecast-bot/status?days=${days}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'include', signal });
  const json = (await res.json()) as ListResponse;
  if (!res.ok || !json.ok) throw new Error(json.error || `Status failed (${res.status})`);
  return json;
}

async function getBotSettings(signal?: AbortSignal) {
  const res = await fetch('/api/admin/bot-settings/minute-bot', { cache: 'no-store', credentials: 'include', signal });
  const json = (await res.json()) as BotSettingsResponse;
  if (!res.ok || !json.ok) throw new Error((json as any).error || `Settings failed (${res.status})`);
  return json as { ok: true; tradingEnabled: boolean; predictionHorizonMinutes: number; tradeFrequencyMinutes: number; updatedAt: string | null };
}

async function setBotSettings(input: { tradingEnabled?: boolean; predictionHorizonMinutes?: number; tradeFrequencyMinutes?: number }) {
  const res = await fetch('/api/admin/bot-settings/minute-bot', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as BotSettingsResponse;
  if (!res.ok || !json.ok) throw new Error((json as any).error || `Settings update failed (${res.status})`);
  return json as { ok: true; tradingEnabled: boolean; predictionHorizonMinutes: number; tradeFrequencyMinutes: number; updatedAt: string | null };
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(digits);
}

export default function ThirtySecondForecastPanel() {
  const [error, setError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [latest, setLatest] = useState<ListResponse['latestQuote'] | null>(null);
  const [latestPrediction, setLatestPrediction] = useState<any | null>(null);
  const [stats, setStats] = useState<ListResponse['stats'] | null>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [tradingEnabled, setTradingEnabled] = useState<boolean | null>(null);
  const [horizonInput, setHorizonInput] = useState<string>('1');
  const [freqInput, setFreqInput] = useState<string>('1');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const inflight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const exportHref = useMemo(() => `/api/admin/30s-forecast/export?days=7`, []);

  const refreshStatus = async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setError(null);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const [s, settings] = await Promise.all([getStatus(7, 200, ac.signal), getBotSettings(ac.signal)]);
      setLastTickAt(s.serverAsOf ?? new Date().toISOString());
      setLatest(s.latestQuote ?? null);
      setLatestPrediction(s.latestPrediction ?? null);
      setStats(s.stats ?? null);
      setPredictions(s.predictions ?? []);
      setTradingEnabled(settings.tradingEnabled);
      setHorizonInput(String(settings.predictionHorizonMinutes ?? 1));
      setFreqInput(String(settings.tradeFrequencyMinutes ?? 1));
    } catch (e) {
      // Ignore abort errors (component unmount or rapid refreshes)
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : `${e}`);
      // keep last good state
    } finally {
      inflight.current = false;
    }
  };

  useEffect(() => {
    let active = true;

    const safeRefresh = async () => {
      if (!active) return;
      await refreshStatus();
    };

    void safeRefresh();

    const interval = window.setInterval(() => {
      void safeRefresh();
    }, 10_000);

    const onFocus = () => void safeRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void safeRefresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={async () => {
              try {
                setError(null);
                const next = !(tradingEnabled ?? true);
                const updated = await setBotSettings({ tradingEnabled: next });
                setTradingEnabled(updated.tradingEnabled);
                await refreshStatus();
              } catch (e) {
                setError(e instanceof Error ? e.message : `${e}`);
              }
            }}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              tradingEnabled === false ? 'bg-emerald-600 text-black hover:bg-emerald-500' : 'bg-red-600 text-white hover:bg-red-500'
            }`}
          >
            {tradingEnabled === false ? 'Start Trading' : 'Stop Trading'}
          </button>
          <div className="flex items-center gap-2 flex-wrap rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2">
            <div className="text-sm text-gray-300 font-semibold">Settings</div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-400">Horizon (min)</span>
              <input
                value={horizonInput}
                onChange={(e) => setHorizonInput(e.target.value)}
                inputMode="numeric"
                className="w-16 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-400">Trade freq (min)</span>
              <input
                value={freqInput}
                onChange={(e) => setFreqInput(e.target.value)}
                inputMode="numeric"
                className="w-16 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-gray-200"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                try {
                  setError(null);
                  const horizon = Number(horizonInput);
                  const freq = Number(freqInput);
                  const updated = await setBotSettings({ predictionHorizonMinutes: horizon, tradeFrequencyMinutes: freq });
                  setHorizonInput(String(updated.predictionHorizonMinutes ?? horizon));
                  setFreqInput(String(updated.tradeFrequencyMinutes ?? freq));
                  setSavedAt(new Date().toISOString());
                  setTimeout(() => setSavedAt(null), 2500);
                  await refreshStatus();
                } catch (e) {
                  setError(e instanceof Error ? e.message : `${e}`);
                }
              }}
              className="px-3 py-1.5 rounded-md text-sm font-semibold bg-gold-600 text-black hover:bg-gold-500"
            >
              Save
            </button>
            {savedAt && <span className="text-xs text-emerald-300">Saved</span>}
          </div>
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                setError(null);
                const res = await fetch('/api/admin/forecast-bot/run-now', { method: 'POST', cache: 'no-store', credentials: 'include' });
                const json = (await res.json()) as any;
                if (!res.ok || !json?.ok) throw new Error(json?.error || `Run-now failed (${res.status})`);
                await refreshStatus();
              } catch (e) {
                setError(e instanceof Error ? e.message : `${e}`);
              }
            }}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gold-600 text-black hover:bg-gold-500"
          >
            Validate now (admin)
          </button>
          <a
            href={exportHref}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gold-600 text-black hover:bg-gold-500"
          >
            Export Excel (last 7 days)
          </a>
        </div>
        <div className="text-xs text-gray-400">
          Last refresh: <span className="text-gray-200">{lastTickAt ?? '—'}</span>
        </div>
      </div>

      {tradingEnabled === false && (
        <div className="rounded-md border border-yellow-800 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-200">
          Trading is <span className="font-semibold">OFF</span>. Forecasts continue; trades are paused.
        </div>
      )}

      <div className="text-xs text-gray-400">
        Forecast validates at: <span className="text-gray-200">minute + {horizonInput || '—'}m</span> (due_at). Trades run every{' '}
        <span className="text-gray-200">{freqInput || '—'}m</span> when Trading is ON.
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Latest global ounce (XAU/USD)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-2xl font-bold text-gray-100">
              {latest ? fmt(latest.price, 2) : '—'}
            </div>
            {latest?.isStale && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-yellow-700/40 text-yellow-200 border border-yellow-700">
                STALE (&gt;120s)
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            quoteAt:{' '}
            <span className="text-gray-200">
              {latest?.quoteTimestampMs ? new Date(latest.quoteTimestampMs).toISOString() : '—'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Current prediction</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-xl font-bold text-gold-400">
              {latestPrediction?.predicted_direction ?? '—'}
            </div>
            <div className="text-xs text-gray-400">
              due: <span className="text-gray-200">{latestPrediction?.due_at ?? '—'}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            p0: <span className="text-gray-200">{latestPrediction?.p0 ?? '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Stats (last 7 days)</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">
              Accuracy: <span className="text-gray-200">{stats?.accuracy != null ? `${(stats.accuracy * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="text-gray-400">
              Trades (OK/LATE):{' '}
              <span className="text-gray-200">
                {stats?.totalTradesOK ?? '—'}/{stats?.totalTradesLate ?? '—'}
              </span>
            </div>
            <div className="text-gray-400">
              PnL (OK): <span className="text-gray-200">{stats ? fmt((stats.cumulativePnlOK as number | undefined) ?? null, 4) : '—'}</span>
            </div>
            <div className="text-gray-400">
              Win rate (OK): <span className="text-gray-200">{stats?.winRateOK != null ? `${(stats.winRateOK * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="text-gray-400">
              Signal: <span className="text-gray-200">{stats?.signalRate != null ? `${(stats.signalRate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="text-gray-400">
              Avg slip (OK): <span className="text-gray-200">{stats?.avgAbsExitSlippageMsOK != null ? `${fmt(stats.avgAbsExitSlippageMsOK, 0)}ms` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">Recent predictions</div>
          <div className="text-xs text-gray-400">Showing {predictions.length} rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">p0_at</th>
                <th className="text-left px-4 py-2">dir</th>
                <th className="text-left px-4 py-2">p0</th>
                <th className="text-left px-4 py-2">pred</th>
                <th className="text-left px-4 py-2">conf</th>
                <th className="text-left px-4 py-2">p1</th>
                <th className="text-left px-4 py-2">result</th>
                <th className="text-left px-4 py-2">slip</th>
                <th className="text-left px-4 py-2">status</th>
                <th className="text-left px-4 py-2">pnl</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {predictions.map((p) => (
                <tr key={p.id} className="text-gray-200">
                  <td className="px-4 py-2 whitespace-nowrap">{p.p0_at}</td>
                  <td className="px-4 py-2 font-semibold">{p.predicted_direction}</td>
                  <td className="px-4 py-2">{fmt(asNumber(p.p0), 2)}</td>
                  <td className="px-4 py-2">{p.predicted_price == null ? '—' : fmt(asNumber(p.predicted_price), 2)}</td>
                  <td className="px-4 py-2">
                    {p.confidence == null ? '—' : `${(asNumber(p.confidence)! * 100).toFixed(0)}%`}
                  </td>
                  <td className="px-4 py-2">{p.p1 == null ? '—' : fmt(asNumber(p.p1), 2)}</td>
                  <td className="px-4 py-2">{p.result ?? '—'}</td>
                  <td className="px-4 py-2">{p.trade?.exit_slippage_ms != null ? `${Number(p.trade.exit_slippage_ms)}ms` : '—'}</td>
                  <td className="px-4 py-2">{p.trade?.trade_status ?? '—'}</td>
                  <td className="px-4 py-2">{p.trade ? fmt(asNumber(p.trade.pnl_usd), 4) : '—'}</td>
                </tr>
              ))}
              {predictions.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-400" colSpan={10}>
                    No predictions yet.
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

function asNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

