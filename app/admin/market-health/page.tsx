import Header from '@/components/layout/Header';
import EgyptIngestionStatusPanel from '@/components/admin/EgyptIngestionStatusPanel';
import IngestionConfigPanel from '@/components/admin/IngestionConfigPanel';
import { getServerUser } from '@/lib/supabase/server-auth';
import { isAdminUser } from '@/lib/auth/admin';
import { getEgyptMarketIngestionDiagnostics } from '@/lib/market-ingestion-health';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function badgeClass(badge: 'green' | 'yellow' | 'red'): string {
  if (badge === 'green') return 'bg-emerald-900/50 border-emerald-700 text-emerald-100';
  if (badge === 'yellow') return 'bg-amber-900/40 border-amber-700 text-amber-100';
  return 'bg-red-950/50 border-red-800 text-red-100';
}

export default async function AdminMarketHealthPage() {
  const user = await getServerUser();
  if (!user) redirect('/auth/signin');

  const admin = await isAdminUser();
  if (!admin) {
    return (
      <main className="flex-1 min-w-0">
        <Header title="Market ingestion health" subtitle="Admin diagnostics" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-5 text-red-200">
            <div className="text-lg font-semibold">403 — Forbidden</div>
            <div className="mt-2 text-sm text-red-200/90">You don&apos;t have access to this admin tool.</div>
          </div>
        </div>
      </main>
    );
  }

  const d = await getEgyptMarketIngestionDiagnostics();

  return (
    <main className="flex-1 min-w-0">
      <Header title="Market ingestion health" subtitle="Egypt local sources vs aggregated (same-run)" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <EgyptIngestionStatusPanel />
        <IngestionConfigPanel />
        <div className={`rounded-xl border px-4 py-3 ${badgeClass(d.healthBadge)}`}>
          <div className="text-sm font-semibold uppercase tracking-wide">Health</div>
          <div className="text-2xl font-bold mt-1">{d.healthBadge}</div>
          <div className="text-sm mt-2 opacity-90">
            Server time: <code className="text-white/90">{d.serverNowIso}</code> — freshness window{' '}
            {d.freshnessWindowHours}h — aggregation min sources {d.aggregationMinSources}
          </div>
        </div>

        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold text-white mb-3">Latest aggregated (norm, 21k)</h2>
          {d.latestAggregated ? (
            <ul className="text-sm text-gray-200 space-y-1 font-mono">
              <li>created_at: {d.latestAggregated.createdAt ?? '—'}</li>
              <li>age_minutes: {d.latestAggregated.ageMinutes ?? '—'}</li>
              <li>price: {d.latestAggregated.price ?? '—'}</li>
              <li>ingestion_run_id: {d.latestAggregated.ingestionRunId ?? '—'}</li>
              <li>is_degraded: {String(d.latestAggregated.isDegraded)}</li>
              <li>source_write_count: {d.latestAggregated.sourceWriteCount ?? '—'}</li>
              <li>fresh_source_count: {d.latestAggregated.freshSourceCount ?? '—'}</li>
              <li>degraded_reason: {d.latestAggregated.degradedReason ?? '—'}</li>
            </ul>
          ) : (
            <p className="text-gray-400 text-sm">No aggregated rows found.</p>
          )}
          <div className="mt-3 text-sm text-gray-300 border-t border-gray-800 pt-3">
            <div>homepageSafeToUse: <span className="text-white">{String(d.trust.homepageSafeToUse)}</span></div>
            <div>sameRunBacked: <span className="text-white">{String(d.trust.sameRunBacked)}</span></div>
            <div>sourceBacked: <span className="text-white">{String(d.trust.sourceBacked)}</span></div>
            <div>meetsThreshold: <span className="text-white">{String(d.trust.meetsThreshold)}</span></div>
            <div>degraded_reason (trust): <span className="text-white">{d.trust.degradedReason ?? '—'}</span></div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold text-white mb-3">Sources (latest 21k per source)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-200">
              <thead className="text-xs uppercase text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-2 pr-4">source</th>
                  <th className="py-2 pr-4">stale</th>
                  <th className="py-2 pr-4">age (min)</th>
                  <th className="py-2 pr-4">price</th>
                  <th className="py-2 pr-4">run id</th>
                  <th className="py-2 pr-4">created_at</th>
                </tr>
              </thead>
              <tbody>
                {d.sources.map((s) => (
                  <tr key={s.source} className="border-b border-gray-800/80">
                    <td className="py-2 pr-4 font-mono">{s.source}</td>
                    <td className="py-2 pr-4">{s.stale ? 'yes' : 'no'}</td>
                    <td className="py-2 pr-4">{s.ageMinutes ?? '—'}</td>
                    <td className="py-2 pr-4">{s.price21 ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{s.ingestionRunId ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{s.latestCreatedAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {d.notes.length > 0 ? (
          <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-amber-100 text-sm">
            <div className="font-semibold mb-2">Notes</div>
            <ul className="list-disc pl-5 space-y-1">
              {d.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-xs text-gray-500">
          JSON: <code className="text-gray-400">GET /api/debug/market-health</code> (admin session required)
        </p>
      </div>
    </main>
  );
}
