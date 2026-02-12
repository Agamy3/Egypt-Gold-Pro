'use client';

import React, { useEffect, useState } from 'react';

type Metrics = {
  ok: boolean;
  error?: string;
  windowDays: number;
  algorithm_accuracy_pct: number;
  algorithm_evaluated_count: number;
  ai_override_rate_pct: number;
  ai_downgrade_rate_pct: number;
  premium_ai_usage_count: number;
  signal_distribution: { BUY: number; SELL: number; HOLD: number };
  asia_session_win_rate_pct: number;
  non_asia_session_win_rate_pct: number;
  serverAsOf: string;
};

export default function SignalsMetricsPanel() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/admin/signals/metrics', { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as Metrics | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
        setData(json);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-400">Signals analytics</div>
          <div className="text-xs text-gray-500 mt-1">serverAsOf: {data?.serverAsOf ?? '—'}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            // quick refresh
            void (async () => {
              try {
                const res = await fetch('/api/admin/signals/metrics', { cache: 'no-store' });
                const json = (await res.json().catch(() => null)) as Metrics | null;
                if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
                setData(json);
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load');
              }
            })();
          }}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-300">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">Algorithm</div>
          <div className="mt-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Accuracy (last {data?.windowDays ?? 7}d):</span>{' '}
              <span className="font-semibold">{data ? `${data.algorithm_accuracy_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Evaluated:</span>{' '}
              <span className="font-semibold">{data?.algorithm_evaluated_count ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">AI validation</div>
          <div className="mt-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Override rate:</span>{' '}
              <span className="font-semibold">{data ? `${data.ai_override_rate_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Downgrade rate:</span>{' '}
              <span className="font-semibold">{data ? `${data.ai_downgrade_rate_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Premium AI usage:</span>{' '}
              <span className="font-semibold">{data?.premium_ai_usage_count ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">Signal distribution</div>
          <div className="mt-3 text-sm text-gray-300">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">BUY:</span> <span className="font-semibold">{data?.signal_distribution?.BUY ?? '—'}</span>
              <span className="text-gray-400">SELL:</span> <span className="font-semibold">{data?.signal_distribution?.SELL ?? '—'}</span>
              <span className="text-gray-400">HOLD:</span> <span className="font-semibold">{data?.signal_distribution?.HOLD ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">Session win rates</div>
          <div className="mt-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Asia:</span>{' '}
              <span className="font-semibold">{data ? `${data.asia_session_win_rate_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Non-Asia:</span>{' '}
              <span className="font-semibold">{data ? `${data.non_asia_session_win_rate_pct}%` : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

