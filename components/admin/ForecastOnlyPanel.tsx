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
  horizon_minutes: number | null;
  due_at: string | null;
  validated_at: string | null;
  p1: number | null;
  outcome: string | null;
};

type BotSettings = {
  tradingEnabled: boolean;
  predictionHorizonMinutes: number;
  tradeFrequencyMinutes: number;
  updatedAt: string | null;
};

async function getBotSettings(signal?: AbortSignal): Promise<BotSettings> {
  const res = await fetch('/api/admin/bot-settings/minute-bot', { cache: 'no-store', credentials: 'include', signal });
  const json = (await res.json()) as any;
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Settings failed (${res.status})`);
  return {
    tradingEnabled: json.tradingEnabled !== false,
    predictionHorizonMinutes: Number(json.predictionHorizonMinutes ?? 1),
    tradeFrequencyMinutes: Number(json.tradeFrequencyMinutes ?? 1),
    updatedAt: json.updatedAt ?? null,
  };
}

async function saveBotSettings(input: { predictionHorizonMinutes: number; tradeFrequencyMinutes: number }): Promise<BotSettings> {
  const res = await fetch('/api/admin/bot-settings/minute-bot', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as any;
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Settings update failed (${res.status})`);
  return {
    tradingEnabled: json.tradingEnabled !== false,
    predictionHorizonMinutes: Number(json.predictionHorizonMinutes ?? 1),
    tradeFrequencyMinutes: Number(json.tradeFrequencyMinutes ?? 1),
    updatedAt: json.updatedAt ?? null,
  };
}

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
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [horizonInput, setHorizonInput] = useState<string>('1');
  const [freqInput, setFreqInput] = useState<string>('1');
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
      const [s, bs] = await Promise.all([getStatus(7, 1000, ac.signal), getBotSettings(ac.signal)]);
      setServerAsOf(s.serverAsOf ?? new Date().toISOString());
      setRows(s.rows ?? []);
      setSettings(bs);
      setHorizonInput(String(bs.predictionHorizonMinutes));
      setFreqInput(String(bs.tradeFrequencyMinutes));
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
                  const updated = await saveBotSettings({ predictionHorizonMinutes: horizon, tradeFrequencyMinutes: freq });
                  setSettings(updated);
                  setSavedAt(new Date().toISOString());
                  setTimeout(() => setSavedAt(null), 2500);
                  await refresh();
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

      {settings && (
        <div className="text-xs text-gray-400">
          Forecast validates at: <span className="text-gray-200">minute + {settings.predictionHorizonMinutes}m</span>{' '}
          (due_at). Trades run every <span className="text-gray-200">{settings.tradeFrequencyMinutes}m</span> when Trading is ON.
        </div>
      )}

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
                <th className="text-left px-4 py-2">horizon</th>
                <th className="text-left px-4 py-2">due_at</th>
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
                  <td className="px-4 py-2">{r.horizon_minutes ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{r.due_at ?? '—'}</td>
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
                  <td className="px-4 py-4 text-gray-400" colSpan={14}>
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

