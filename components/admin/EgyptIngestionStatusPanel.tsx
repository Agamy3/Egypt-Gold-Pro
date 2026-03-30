'use client';

import { useEffect, useMemo, useState } from 'react';

type IngestionStatus = 'healthy' | 'delayed' | 'stale' | 'dead';

type DebugMarketHealthResponse = {
  ok: boolean;
  serverTime?: string;
  ingestion?: {
    lastIngestionAt: string | null;
    ageMinutes: number | null;
    expectedFrequencyMinutes: number;
    status: IngestionStatus;
  };
};

function badgeClass(status: IngestionStatus): string {
  if (status === 'healthy') return 'bg-emerald-900/50 border-emerald-700 text-emerald-100';
  if (status === 'delayed') return 'bg-amber-900/40 border-amber-700 text-amber-100';
  if (status === 'stale') return 'bg-orange-900/40 border-orange-700 text-orange-100';
  return 'bg-red-950/50 border-red-800 text-red-100';
}

export default function EgyptIngestionStatusPanel() {
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [data, setData] = useState<DebugMarketHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const ingestion = data?.ingestion;
  const status: IngestionStatus = ingestion?.status ?? 'dead';

  const warnings = useMemo(() => {
    const age = ingestion?.ageMinutes;
    if (age == null) return { delayed: false, dead: true };

    const expected = ingestion?.expectedFrequencyMinutes ?? 1;
    const delayedAfter = expected * 2;
    const deadAfter = expected * 12;
    return {
      delayed: age > delayedAfter,
      dead: age > deadAfter,
    };
  }, [ingestion?.ageMinutes, ingestion?.expectedFrequencyMinutes]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/debug/market-health', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as DebugMarketHealthResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || `Failed (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ingestion status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runIngestion = async () => {
    setRunLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingestion/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ country: 'EG' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setMessage({ type: 'success', text: 'Ingestion triggered. Refreshing status…' });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to run ingestion' });
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Egypt Ingestion Status</h2>
        <div className={`rounded-lg border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass(status)}`}>
          {status}
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-200 space-y-1">
        <div>
          Last ingestion:{' '}
          <code className="text-white/90">{ingestion?.lastIngestionAt ?? '—'}</code>
        </div>
        <div>
          Age:{' '}
          <span className="text-white">{ingestion?.ageMinutes != null ? `${ingestion.ageMinutes} minutes ago` : '—'}</span>
        </div>
        <div>
          Expected:{' '}
          <span className="text-white">Every {ingestion?.expectedFrequencyMinutes ?? 1} minute</span>
        </div>
        <div className="text-xs text-gray-500">
          Server time: <code className="text-gray-400">{data?.serverTime ?? '—'}</code>
        </div>
      </div>

      {warnings.delayed && !warnings.dead ? (
        <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-amber-100 text-sm">
          ⚠️ Egypt ingestion delayed — data may become stale
        </div>
      ) : null}

      {warnings.dead ? (
        <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-red-100 text-sm">
          🚨 Egypt ingestion stalled — no recent updates
        </div>
      ) : null}

      {message ? (
        <div className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{message.text}</div>
      ) : null}

      {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runIngestion}
          disabled={runLoading}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {runLoading ? 'Running…' : 'Run ingestion now'}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && !data ? <div className="mt-3 text-xs text-gray-500">Loading…</div> : null}
    </section>
  );
}
