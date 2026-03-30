'use client';

import { useEffect, useMemo, useState } from 'react';

type EffectiveConfig = {
  countriesEnabled: { EG: boolean; AE: boolean; SA: boolean };
  egypt: {
    ingestionSourcesEnabled: string[];
    aggregationSourcesEnabled: string[];
  };
};

type SettingsRes = {
  ok: boolean;
  error?: string;
  effective: EffectiveConfig;
  countries: { EG: boolean; AE: boolean; SA: boolean };
  egyptSources: Array<{
    source: string;
    ingestionEnabled: boolean;
    aggregationEnabled: boolean;
    ingestionSetting: null | { key: string; updated_at: string | null; updated_by_user_id: string | null };
    aggregationSetting: null | { key: string; updated_at: string | null; updated_by_user_id: string | null };
  }>;
};

type ToggleRes = {
  ok: boolean;
  error?: string;
  effective?: EffectiveConfig;
};

function badgeClass(on: boolean): string {
  return on
    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
    : 'bg-gray-900/40 border-gray-700 text-gray-200';
}

export default function IngestionConfigPanel() {
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [data, setData] = useState<SettingsRes | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const summary = useMemo(() => {
    const effective = data?.effective;
    return {
      egIngestionCount: effective?.egypt.ingestionSourcesEnabled.length ?? 0,
      egAggregationCount: effective?.egypt.aggregationSourcesEnabled.length ?? 0,
      countries: effective?.countriesEnabled ?? { EG: true, AE: true, SA: true },
    };
  }, [data]);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingestion/settings', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as SettingsRes | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setData(json);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load ingestion settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (key: string, enabled: boolean) => {
    setSavingKey(key);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingestion/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ key, enabled }),
      });
      const json = (await res.json().catch(() => null)) as ToggleRes | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Save failed (${res.status})`);
      setMessage({ type: 'success', text: `${key} saved.` });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingKey(null);
    }
  };

  const countries = data?.effective.countriesEnabled;

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Ingestion Config</h2>
          <div className="mt-1 text-xs text-gray-400">
            Ingestion = fetch + write source rows. Aggregation = participate in aggregated price.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !!savingKey}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-3 text-sm rounded border p-3 ${
            message.type === 'success'
              ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
              : 'border-red-800 bg-red-950/30 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <div className="text-sm font-semibold text-gray-100">Countries</div>
          <div className="mt-3 space-y-3 text-sm">
            {([
              { c: 'EG', label: 'Egypt (EG)', key: 'ingestion_country_enabled_EG' },
              { c: 'AE', label: 'UAE (AE)', key: 'ingestion_country_enabled_AE' },
              { c: 'SA', label: 'Saudi (SA)', key: 'ingestion_country_enabled_SA' },
            ] as const).map((row) => {
              const enabled = (countries as any)?.[row.c] ?? true;
              return (
                <div key={row.c} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-gray-200">{row.label}</div>
                    <div className={`mt-1 inline-flex items-center rounded border px-2 py-0.5 text-xs ${badgeClass(enabled)}`}>
                      {enabled ? 'enabled' : 'disabled'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(row.key, !enabled)}
                    disabled={!!savingKey}
                    className={`px-3 py-2 rounded-md text-sm font-semibold ${
                      enabled ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-emerald-700 text-white hover:bg-emerald-600'
                    } disabled:opacity-60`}
                  >
                    {savingKey === row.key ? 'Saving…' : enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">Egypt sources</div>
              <div className="mt-1 text-xs text-gray-400">
                Active ingestion: {summary.egIngestionCount} — active aggregation: {summary.egAggregationCount}
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-200">
              <thead className="text-xs uppercase text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-2 pr-4">source</th>
                  <th className="py-2 pr-4">ingestion</th>
                  <th className="py-2 pr-4">aggregation</th>
                  <th className="py-2 pr-4">actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.egyptSources ?? []).map((s) => {
                  const ingestKey = `ingestion_source_enabled_${s.source}`;
                  const aggKey = `aggregation_source_enabled_${s.source}`;
                  return (
                    <tr key={s.source} className="border-b border-gray-800/80">
                      <td className="py-2 pr-4 font-mono">{s.source}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${badgeClass(s.ingestionEnabled)}`}>
                          {s.ingestionEnabled ? 'enabled' : 'disabled'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${badgeClass(s.aggregationEnabled)}`}>
                          {s.aggregationEnabled ? 'enabled' : 'disabled'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void toggle(ingestKey, !s.ingestionEnabled)}
                            disabled={!!savingKey}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                              s.ingestionEnabled
                                ? 'bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700'
                                : 'bg-emerald-700 text-white hover:bg-emerald-600'
                            } disabled:opacity-60`}
                          >
                            {savingKey === ingestKey ? 'Saving…' : s.ingestionEnabled ? 'Disable ingestion' : 'Enable ingestion'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void toggle(aggKey, !s.aggregationEnabled)}
                            disabled={!!savingKey}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                              s.aggregationEnabled
                                ? 'bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700'
                                : 'bg-emerald-700 text-white hover:bg-emerald-600'
                            } disabled:opacity-60`}
                          >
                            {savingKey === aggKey ? 'Saving…' : s.aggregationEnabled ? 'Disable aggregation' : 'Enable aggregation'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {data && (data.egyptSources ?? []).length === 0 ? (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={4}>
                      No Egypt sources found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Endpoint: <code className="text-gray-400">GET/POST /api/admin/ingestion/settings</code>
      </div>
    </section>
  );
}
