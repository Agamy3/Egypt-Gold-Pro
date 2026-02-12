'use client';

import React, { useEffect, useState } from 'react';

type Overview = {
  ok: boolean;
  error?: string;
  metrics: {
    algorithm_accuracy_pct: number;
    algorithm_evaluated_count: number;
    ai_override_rate_pct: number;
    ai_downgrade_rate_pct: number;
    signal_distribution: { BUY: number; SELL: number; HOLD: number };
  };
  gold_signals: any[];
  gold_signal_ai_reviews: any[];
  serverAsOf: string;
};

export default function GoldSignalsAdminPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gold-signals/overview', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as Overview | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await load();
    };
    void run();
    const t = setInterval(() => {
      void load();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-400">Gold signals admin</div>
          <div className="text-xs text-gray-500 mt-1">serverAsOf: {data?.serverAsOf ?? '—'}</div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-sm text-red-300">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">Accuracy</div>
          <div className="mt-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Algorithm accuracy:</span>{' '}
              <span className="font-semibold">{metrics ? `${metrics.algorithm_accuracy_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Evaluated outcomes:</span>{' '}
              <span className="font-semibold">{metrics?.algorithm_evaluated_count ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100">AI rates</div>
          <div className="mt-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Override rate:</span>{' '}
              <span className="font-semibold">{metrics ? `${metrics.ai_override_rate_pct}%` : '—'}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-400">Downgrade rate:</span>{' '}
              <span className="font-semibold">{metrics ? `${metrics.ai_downgrade_rate_pct}%` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">Latest gold_signals (100)</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs text-gray-200">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2 pr-3">cycle</th>
                  <th className="text-left py-2 pr-3">country</th>
                  <th className="text-left py-2 pr-3">action</th>
                  <th className="text-left py-2 pr-3">conf</th>
                  <th className="text-left py-2 pr-3">outcome</th>
                  <th className="text-left py-2 pr-3">updated</th>
                </tr>
              </thead>
              <tbody>
                {(data?.gold_signals ?? []).map((r: any) => (
                  <tr key={String(r.id)} className="border-t border-gray-900">
                    <td className="py-2 pr-3 font-mono">{String(r.cycle_key)}</td>
                    <td className="py-2 pr-3">{String(r.country)}</td>
                    <td className="py-2 pr-3">{String(r.action)}</td>
                    <td className="py-2 pr-3">{Number(r.confidence).toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.outcome ?? '—'}</td>
                    <td className="py-2 pr-3">{r.updated_at ? new Date(String(r.updated_at)).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(!data || data.gold_signals.length === 0) && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={6}>
                      No signals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">Latest gold_signal_ai_reviews (100)</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs text-gray-200">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2 pr-3">cycle</th>
                  <th className="text-left py-2 pr-3">country</th>
                  <th className="text-left py-2 pr-3">decision</th>
                  <th className="text-left py-2 pr-3">algo</th>
                  <th className="text-left py-2 pr-3">ai</th>
                  <th className="text-left py-2 pr-3">updated</th>
                </tr>
              </thead>
              <tbody>
                {(data?.gold_signal_ai_reviews ?? []).map((r: any) => (
                  <tr key={String(r.id)} className="border-t border-gray-900">
                    <td className="py-2 pr-3 font-mono">{String(r.cycle_key)}</td>
                    <td className="py-2 pr-3">{String(r.country)}</td>
                    <td className="py-2 pr-3">{String(r.decision)}</td>
                    <td className="py-2 pr-3">{String(r.algo_action)} ({Number(r.algo_confidence).toFixed(2)})</td>
                    <td className="py-2 pr-3">{String(r.ai_action)} ({Number(r.ai_confidence0to1).toFixed(2)})</td>
                    <td className="py-2 pr-3">{r.updated_at ? new Date(String(r.updated_at)).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(!data || data.gold_signal_ai_reviews.length === 0) && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={6}>
                      No AI reviews found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

