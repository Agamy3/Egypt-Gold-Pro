'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminSourcePriceDiagnosticsPayload, AdminSourcePriceRow } from '@/lib/admin/source-price-diagnostics-types';
import { ADMIN_MARKET_COUNTRIES } from '@/lib/admin/source-price-registry';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtPrice(v: number | null | undefined, currency: string | null): string {
  if (v == null || !isFinite(Number(v))) return '—';
  const u = currency || '';
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${u ? ` ${u}` : ''}`;
}

function badgeClass(health: AdminSourcePriceRow['health']): string {
  switch (health) {
    case 'healthy':
      return 'bg-emerald-950 text-emerald-200 border-emerald-800';
    case 'stale':
      return 'bg-amber-950 text-amber-200 border-amber-800';
    case 'failed':
      return 'bg-red-950 text-red-200 border-red-800';
    case 'missing_data':
    default:
      return 'bg-gray-900 text-gray-300 border-gray-700';
  }
}

function healthLabel(h: AdminSourcePriceRow['health']): string {
  if (h === 'healthy') return 'Healthy';
  if (h === 'stale') return 'Stale';
  if (h === 'failed') return 'Failed';
  return 'Missing data';
}

type StatusFilter = 'all' | AdminSourcePriceRow['health'];

export default function SourcePricesDiagnosticsPanel({
  payload,
}: {
  payload: AdminSourcePriceDiagnosticsPayload;
}) {
  const router = useRouter();
  const [country, setCountry] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return payload.rows.filter((r) => {
      if (country !== 'all' && r.country !== country) return false;
      if (status !== 'all' && r.health !== status) return false;
      if (needle && !r.sourceId.toLowerCase().includes(needle) && !r.adapterLabel.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [payload.rows, country, status, q]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            >
              <option value="all">All</option>
              {ADMIN_MARKET_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            >
              <option value="all">All</option>
              <option value="healthy">Healthy</option>
              <option value="stale">Stale</option>
              <option value="failed">Failed</option>
              <option value="missing_data">Missing data</option>
            </select>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-gray-500 mb-1">Search source</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. banklive, goldapi…"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600"
            />
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="px-4 py-2 rounded-lg bg-gold-600 hover:bg-gold-700 text-black text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Generated: <span className="text-gray-300">{new Date(payload.generatedAt).toLocaleString()}</span>
          </span>
          <span>
            Stale threshold:{' '}
            <span className="text-gray-300">{(payload.staleAfterMs / 60000).toFixed(0)} min</span> (
            <code className="text-gray-400">STALE_AFTER_MS</code>)
          </span>
          {payload.meta.goldSpotUsdPerOz != null && (
            <span>
              Spot cache:{' '}
              <span className="text-gray-300">
                ${payload.meta.goldSpotUsdPerOz.toFixed(2)}/oz
                {payload.meta.goldSpotFetchedAt ? ` · ${formatRelative(payload.meta.goldSpotFetchedAt)}` : ''}
                {payload.meta.goldSpotStale ? ' (flagged stale)' : ''}
              </span>
            </span>
          )}
        </div>

        {payload.meta.loadWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-amber-100 text-sm">
            {payload.meta.loadWarnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">CC</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Adapter</th>
                <th className="px-3 py-2 font-medium">24k</th>
                <th className="px-3 py-2 font-medium">22k</th>
                <th className="px-3 py-2 font-medium">21k</th>
                <th className="px-3 py-2 font-medium">18k</th>
                <th className="px-3 py-2 font-medium">14k</th>
                <th className="px-3 py-2 font-medium">Sell 24/21</th>
                <th className="px-3 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium">Checked</th>
                <th className="px-3 py-2 font-medium">Success</th>
                <th className="px-3 py-2 font-medium">Stale</th>
                <th className="px-3 py-2 font-medium">In EG weights</th>
                <th className="px-3 py-2 font-medium">Store</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {filtered.map((r) => (
                <tr key={`${r.country}-${r.sourceId}`} className="hover:bg-gray-900/40">
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${badgeClass(r.health)}`}>
                      {healthLabel(r.health)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-300 align-top">{r.country}</td>
                  <td className="px-3 py-2 text-gray-100 font-mono align-top">{r.sourceId}</td>
                  <td className="px-3 py-2 text-gray-400 max-w-[10rem] align-top">{r.adapterLabel}</td>
                  <td className="px-3 py-2 text-gray-200 align-top">{fmtPrice(r.buyByKarat['24'], r.currency)}</td>
                  <td className="px-3 py-2 text-gray-200 align-top">{fmtPrice(r.buyByKarat['22'], r.currency)}</td>
                  <td className="px-3 py-2 text-gray-200 align-top">{fmtPrice(r.buyByKarat['21'], r.currency)}</td>
                  <td className="px-3 py-2 text-gray-200 align-top">{fmtPrice(r.buyByKarat['18'], r.currency)}</td>
                  <td className="px-3 py-2 text-gray-200 align-top">{fmtPrice(r.buyByKarat['14'], r.currency)}</td>
                  <td className="px-3 py-2 text-gray-400 align-top">
                    <div>24s {fmtPrice(r.sellByKarat['24'], r.currency)}</div>
                    <div>21s {fmtPrice(r.sellByKarat['21'], r.currency)}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-[12rem] align-top">{r.globalReference || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 align-top whitespace-nowrap">
                    {formatRelative(r.lastCheckedAt)} <span className="text-gray-600 block text-[10px]">{r.lastCheckedAt || ''}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 align-top whitespace-nowrap">
                    {formatRelative(r.lastSuccessAt)} <span className="text-gray-600 block text-[10px]">{r.lastSuccessAt || ''}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={r.stale ? 'text-amber-300' : 'text-emerald-300'}>{r.stale ? 'yes' : 'no'}</span>
                    <div className="text-[10px] text-gray-500">{r.staleBasis}</div>
                    {r.freshnessAgeMs != null && (
                      <div className="text-[10px] text-gray-500">{Math.round(r.freshnessAgeMs / 60000)} min over</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-300 align-top">
                    {r.usedInWeightedAggregation === null ? '—' : r.usedInWeightedAggregation ? 'yes' : 'no'}
                  </td>
                  <td className="px-3 py-2 text-gray-500 align-top">{r.storageCoverage}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[14rem] align-top">
                    {r.errorMessage && <div className="text-red-300 mb-1">{r.errorMessage}</div>}
                    {r.notes.map((n) => (
                      <div key={n} className="text-[10px]">
                        {n}
                      </div>
                    ))}
                    {Object.keys(r.perKaratStale).length > 0 && (
                      <div className="text-[10px] mt-1 text-gray-600">
                        {(['24', '22', '21', '18', '14'] as const)
                          .filter((k) => r.perKaratStale[k] !== undefined)
                          .map((k) => `${k}k:${r.perKaratStale[k] ? 'stale' : 'ok'}`)
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-800">
          <p>
            Read-only diagnostics from <code className="text-gray-400">market_snapshots</code>,{' '}
            <code className="text-gray-400">market_snapshots_norm</code>, and <code className="text-gray-400">source_staleness</code>.
            Stale uses the same window as ingestion (<code className="text-gray-400">STALE_AFTER_MS</code> in{' '}
            <code className="text-gray-400">gold-ingestion-config</code>). When no <code className="text-gray-400">source_staleness</code>{' '}
            row exists (typical for non-Egypt sources), age is taken from the latest stored snapshot for that source/karat.
          </p>
          <p className="mt-2">
            &quot;In EG weights&quot; is yes when stored prices would contribute to Egypt&apos;s weighted average (scrapers listed in{' '}
            <code className="text-gray-400">SOURCE_WEIGHTS</code> only); aggregate and legacy rows show —.
          </p>
        </div>
      </div>
    </div>
  );
}
