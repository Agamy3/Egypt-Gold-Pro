'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Row = {
  minute_key: string;
  p0: number | null;
  predicted_price: number | null;
  direction: 'UP' | 'DOWN' | 'TIE' | 'STALE' | 'NA';
  confidence: number | null;
  provider: string | null;
  source: string | null;
  created_at: string;
  updated_at: string | null;
  validated_at: string | null;
  p1: number | null;
  outcome: string | null;
};

type StatusResponse = {
  ok: boolean;
  error?: string;
  serverAsOf?: string;
  rows?: Row[];
};

async function getStatus(days = 7, limit = 1000, signal?: AbortSignal) {
  const url = `/api/admin/forecast-only/status?days=${days}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'include', signal });
  const json = (await res.json()) as StatusResponse;
  if (!res.ok || !json.ok) throw new Error(json.error || `Status failed (${res.status})`);
  return json;
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(digits);
}

function DirectionBadge({ dir }: { dir: Row['direction'] }) {
  const cls =
    dir === 'UP'
      ? 'bg-emerald-700/30 text-emerald-200 border-emerald-700'
      : dir === 'DOWN'
        ? 'bg-red-700/30 text-red-200 border-red-700'
        : dir === 'TIE'
          ? 'bg-gray-700/30 text-gray-200 border-gray-700'
          : dir === 'STALE'
            ? 'bg-yellow-700/30 text-yellow-200 border-yellow-700'
            : 'bg-gray-800/40 text-gray-300 border-gray-700';
  return <span className={`text-xs font-semibold px-2 py-1 rounded border ${cls}`}>{dir}</span>;
}

export default function ForecastOnlyPanel() {
  const [error, setError] = useState<string | null>(null);
  const [serverAsOf, setServerAsOf] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [displayTz, setDisplayTz] = useState<'local' | 'utc'>('local');

  const inflight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const visibleRows = useMemo(() => rows, [rows]);

  const refresh = async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setError(null);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const s = await getStatus(7, 1000, ac.signal);
      setServerAsOf(s.serverAsOf ?? new Date().toISOString());
      setRows(s.rows ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : `${e}`);
    } finally {
      inflight.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    const safeRefresh = async () => {
      if (!active) return;
      await refresh();
    };

    void safeRefresh();

    const interval = window.setInterval(() => void safeRefresh(), 10_000);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatMinute = (minuteKey: string) => {
    const d = new Date(minuteKey);
    if (!isFinite(d.getTime())) return minuteKey;
    return displayTz === 'utc' ? d.toISOString().slice(0, 16).replace('T', ' ') + 'Z' : d.toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Refresh
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-gray-400">Time:</span>
            <select
              value={displayTz}
              onChange={(e) => setDisplayTz(e.target.value === 'utc' ? 'utc' : 'local')}
              className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-gray-200"
            >
              <option value="local">Local</option>
              <option value="utc">UTC</option>
            </select>
          </label>
        </div>
        <div className="text-xs text-gray-400">
          Last refresh: <span className="text-gray-200">{serverAsOf ?? '—'}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">Per-minute forecasts (read-only)</div>
          <div className="text-xs text-gray-400">Showing {visibleRows.length} rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">minute_key</th>
                <th className="text-left px-4 py-2">minute (display)</th>
                <th className="text-left px-4 py-2">p0</th>
                <th className="text-left px-4 py-2">predicted</th>
                <th className="text-left px-4 py-2">dir</th>
                <th className="text-left px-4 py-2">conf</th>
                <th className="text-left px-4 py-2">validated_at</th>
                <th className="text-left px-4 py-2">p1</th>
                <th className="text-left px-4 py-2">outcome</th>
                <th className="text-left px-4 py-2">provider</th>
                <th className="text-left px-4 py-2">source</th>
                <th className="text-left px-4 py-2">created_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {visibleRows.map((r) => (
                <tr key={r.minute_key} className="text-gray-200">
                  <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-gray-300">{r.minute_key}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatMinute(r.minute_key)}</td>
                  <td className="px-4 py-2">{fmt(r.p0, 2)}</td>
                  <td className="px-4 py-2">{fmt(r.predicted_price, 2)}</td>
                  <td className="px-4 py-2">
                    <DirectionBadge dir={r.direction} />
                  </td>
                  <td className="px-4 py-2">{r.confidence == null ? '—' : `${(r.confidence * 100).toFixed(0)}%`}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{r.validated_at ?? '—'}</td>
                  <td className="px-4 py-2">{fmt(r.p1, 2)}</td>
                  <td className="px-4 py-2">{r.outcome ?? '—'}</td>
                  <td className="px-4 py-2">{r.provider ?? '—'}</td>
                  <td className="px-4 py-2">{r.source ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{r.created_at ?? '—'}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-400" colSpan={12}>
                    No forecast rows found in the selected window.
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

