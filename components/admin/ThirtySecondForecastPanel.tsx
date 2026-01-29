'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type TickResponse = {
  ok: boolean;
  error?: string;
  createdPrediction?: any;
  validated?: { count: number };
  latest?: { price: number; pointAt: string; isStale: boolean };
  meta?: { serverAsOf: string };
};

type ListResponse = {
  ok: boolean;
  error?: string;
  stats?: {
    totalPredictions: number;
    judgedPredictions: number;
    trueCount: number;
    falseCount: number;
    tieCount: number;
    naCount: number;
    accuracy: number | null;
    totalTrades: number;
    cumulativePnl: number;
    avgPnl: number | null;
    winRate: number | null;
  };
  predictions?: any[];
};

async function postTick() {
  const res = await fetch('/api/admin/30s-forecast/tick', { method: 'POST', cache: 'no-store' });
  const json = (await res.json()) as TickResponse;
  if (!res.ok || !json.ok) throw new Error(json.error || `Tick failed (${res.status})`);
  return json;
}

async function getList(days = 7, limit = 200) {
  const url = `/api/admin/30s-forecast/list?days=${days}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as ListResponse;
  if (!res.ok || !json.ok) throw new Error(json.error || `List failed (${res.status})`);
  return json;
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(digits);
}

export default function ThirtySecondForecastPanel() {
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [latest, setLatest] = useState<{ price: number; pointAt: string; isStale: boolean } | null>(null);
  const [createdPrediction, setCreatedPrediction] = useState<any | null>(null);
  const [stats, setStats] = useState<ListResponse['stats'] | null>(null);
  const [predictions, setPredictions] = useState<any[]>([]);

  const inflight = useRef(false);
  const timerRef = useRef<number | null>(null);

  const exportHref = useMemo(() => `/api/admin/30s-forecast/export?days=7`, []);

  const refreshList = async () => {
    const list = await getList(7, 200);
    setStats(list.stats ?? null);
    setPredictions(list.predictions ?? []);
  };

  const doTick = async (reason: string) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setError(null);
      const tick = await postTick();
      setLastTickAt(tick.meta?.serverAsOf ?? new Date().toISOString());
      if (tick.latest) setLatest(tick.latest);
      if (tick.createdPrediction) setCreatedPrediction(tick.createdPrediction);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${e}`);
      // keep last good state
    } finally {
      inflight.current = false;
    }
  };

  useEffect(() => {
    // Initial tick and list.
    void doTick('mount');

    const onFocus = () => {
      if (!document.hidden) void doTick('focus');
    };
    const onVis = () => {
      if (!document.hidden) void doTick('visible');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (!document.hidden) void doTick('interval');
    }, 30_000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRunning((v) => !v)}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              running ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-200'
            }`}
          >
            {running ? 'Running' : 'Stopped'}
          </button>
          <button
            type="button"
            onClick={() => void doTick('manual')}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Tick now
          </button>
          <a
            href={exportHref}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gold-600 text-black hover:bg-gold-500"
          >
            Export Excel (last 7 days)
          </a>
        </div>
        <div className="text-xs text-gray-400">
          Last tick: <span className="text-gray-200">{lastTickAt ?? '—'}</span>
        </div>
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
            pointAt: <span className="text-gray-200">{latest?.pointAt ?? '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Current prediction</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-xl font-bold text-gold-400">
              {createdPrediction?.predicted_direction ?? '—'}
            </div>
            <div className="text-xs text-gray-400">
              due: <span className="text-gray-200">{createdPrediction?.due_at ?? '—'}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            p0: <span className="text-gray-200">{createdPrediction?.p0 ?? '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="text-sm text-gray-400">Stats (last 7 days)</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">
              Accuracy: <span className="text-gray-200">{stats?.accuracy != null ? `${(stats.accuracy * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="text-gray-400">
              Trades: <span className="text-gray-200">{stats?.totalTrades ?? '—'}</span>
            </div>
            <div className="text-gray-400">
              PnL: <span className="text-gray-200">{stats ? fmt(stats.cumulativePnl, 4) : '—'}</span>
            </div>
            <div className="text-gray-400">
              Win rate: <span className="text-gray-200">{stats?.winRate != null ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}</span>
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
                <th className="text-left px-4 py-2">p1</th>
                <th className="text-left px-4 py-2">result</th>
                <th className="text-left px-4 py-2">pnl</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {predictions.map((p) => (
                <tr key={p.id} className="text-gray-200">
                  <td className="px-4 py-2 whitespace-nowrap">{p.p0_at}</td>
                  <td className="px-4 py-2 font-semibold">{p.predicted_direction}</td>
                  <td className="px-4 py-2">{fmt(asNumber(p.p0), 2)}</td>
                  <td className="px-4 py-2">{fmt(asNumber(p.p1), 2)}</td>
                  <td className="px-4 py-2">{p.result ?? '—'}</td>
                  <td className="px-4 py-2">{p.trade ? fmt(asNumber(p.trade.pnl_usd), 4) : '—'}</td>
                </tr>
              ))}
              {predictions.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-400" colSpan={6}>
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
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

