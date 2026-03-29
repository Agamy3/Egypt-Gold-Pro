'use client';

import { useEffect, useMemo, useState } from 'react';

type StatusRes = {
  ok: boolean;
  error?: string;
  configured: boolean;
  botTokenPresent: boolean;
  botUsername: string | null;
  webhook: any | null;
  webhookError: string | null;
};

type AutomationsRes = {
  ok: boolean;
  error?: string;
  settings: {
    globalEnabled: boolean;
    goldSignalsEnabled: boolean;
    notifyRulesEnabled: boolean;
  };
  automations: Array<{
    key: 'gold_signals' | 'notify_rules';
    name: string;
    trigger: string;
    enabled: boolean;
    last: any | null;
  }>;
};

type LogsRes = {
  ok: boolean;
  error?: string;
  rows: any[];
};

type RunNowRes = {
  ok: boolean;
  automation: 'gold_signals' | 'notify_rules';
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  message: string;
  error?: string;
};

type TgDiagnosticsRes = {
  ok: boolean;
  error?: string;
  linkedUsers: number;
  enabledUsers: number;
  activeUsers: number;
  failedSends: number;
  latestDeliveries: Array<{ status: string; error: string | null; created_at: string }>;
};

function badgeClass(variant: 'healthy' | 'paused' | 'disabled' | 'error' | 'missing') {
  if (variant === 'healthy') return 'bg-emerald-950/40 border-emerald-800 text-emerald-200';
  if (variant === 'paused') return 'bg-amber-950/40 border-amber-800 text-amber-200';
  if (variant === 'disabled') return 'bg-gray-900/40 border-gray-700 text-gray-200';
  if (variant === 'missing') return 'bg-red-950/40 border-red-800 text-red-200';
  return 'bg-red-950/40 border-red-800 text-red-200';
}

function formatWhen(x: any): string {
  const v = x ? String(x) : '';
  const t = Date.parse(v);
  if (!isFinite(t)) return '—';
  return new Date(t).toLocaleString();
}

export default function TelegramAutomationPanel() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusRes | null>(null);
  const [automations, setAutomations] = useState<AutomationsRes | null>(null);
  const [logs, setLogs] = useState<LogsRes | null>(null);
  const [diag, setDiag] = useState<TgDiagnosticsRes | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const summary = useMemo(() => {
    const globalEnabled = automations?.settings?.globalEnabled ?? true;
    const list = automations?.automations ?? [];
    const enabledCount = list.filter((a) => a.enabled).length;
    const failedCount = (diag?.failedSends ?? 0) > 0 ? 1 : 0;
    const lastDeliveryAt = diag?.latestDeliveries?.[0]?.created_at ?? null;
    const lastDeliveryStatus = diag?.latestDeliveries?.[0]?.status ?? null;
    return { globalEnabled, enabledCount, failedCount, lastDeliveryAt, lastDeliveryStatus };
  }, [automations, diag]);

  const loadAll = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [sRes, aRes, lRes, dRes] = await Promise.all([
        fetch('/api/admin/telegram/status', { cache: 'no-store' }),
        fetch('/api/admin/telegram/automations', { cache: 'no-store' }),
        fetch('/api/admin/telegram/logs?limit=80', { cache: 'no-store' }),
        fetch('/api/admin/notifications/test-telegram', { cache: 'no-store' }),
      ]);

      const sJson = (await sRes.json().catch(() => null)) as StatusRes | null;
      const aJson = (await aRes.json().catch(() => null)) as AutomationsRes | null;
      const lJson = (await lRes.json().catch(() => null)) as LogsRes | null;
      const dJson = (await dRes.json().catch(() => null)) as TgDiagnosticsRes | null;

      if (!sRes.ok || !sJson?.ok) throw new Error(sJson?.error || `Status failed (${sRes.status})`);
      if (!aRes.ok || !aJson?.ok) throw new Error(aJson?.error || `Automations failed (${aRes.status})`);
      if (!lRes.ok || !lJson?.ok) throw new Error(lJson?.error || `Logs failed (${lRes.status})`);
      if (!dRes.ok || !dJson?.ok) throw new Error(dJson?.error || `Diagnostics failed (${dRes.status})`);

      setStatus(sJson);
      setAutomations(aJson);
      setLogs(lJson);
      setDiag(dJson);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load Telegram panel' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const toggle = async (key: 'global' | 'gold_signals' | 'notify_rules', enabled: boolean) => {
    setBusyKey(`toggle:${key}`);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/telegram/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ key, enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Toggle failed (${res.status})`);
      setMessage({ type: 'success', text: `${key} is now ${enabled ? 'enabled' : 'disabled'}.` });
      await loadAll();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Toggle failed' });
    } finally {
      setBusyKey(null);
    }
  };

  const runAutomation = async (key: 'gold_signals' | 'notify_rules') => {
    setBusyKey(`run:${key}`);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/telegram/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ key }),
      });
      const json = (await res.json().catch(() => null)) as RunNowRes | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Run failed (${res.status})`);

      const summary = `${json.message} (attempted=${json.attempted}, sent=${json.sent}, skipped=${json.skipped}, failed=${json.failed})`;
      const type = json.failed > 0 ? 'error' : 'success';
      setMessage({ type, text: summary });
      await loadAll();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Run failed' });
    } finally {
      setBusyKey(null);
    }
  };

  const sendTestToMe = async () => {
    setBusyKey('test');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/notifications/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ target: 'me', mode: 'test', dryRun: false, language: 'en' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Test send failed (${res.status})`);
      setMessage({ type: 'success', text: 'Test Telegram message sent to your admin-linked chat.' });
      await loadAll();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Test send failed' });
    } finally {
      setBusyKey(null);
    }
  };

  const globalVariant: 'healthy' | 'paused' | 'missing' =
    status?.configured ? (summary.globalEnabled ? 'healthy' : 'paused') : 'missing';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-400">Telegram automation</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-2 rounded border px-2 py-1 ${badgeClass(globalVariant)}`}>
              {status?.configured ? (summary.globalEnabled ? 'healthy' : 'paused') : 'missing config'}
            </span>
            <span className="rounded bg-gray-950/40 border border-gray-800 px-2 py-1 text-gray-300">
              bot token: {status?.botTokenPresent ? 'present' : 'missing'}
            </span>
            <span className="rounded bg-gray-950/40 border border-gray-800 px-2 py-1 text-gray-300">
              bot username: {status?.botUsername ? `@${String(status.botUsername).replace('@', '')}` : '—'}
            </span>
            <span className="rounded bg-gray-950/40 border border-gray-800 px-2 py-1 text-gray-300">
              enabled automations: {summary.enabledCount}
            </span>
            <span className="rounded bg-gray-950/40 border border-gray-800 px-2 py-1 text-gray-300">
              last send: {summary.lastDeliveryAt ? formatWhen(summary.lastDeliveryAt) : '—'}
            </span>
            <span className="rounded bg-gray-950/40 border border-gray-800 px-2 py-1 text-gray-300">
              last status: {summary.lastDeliveryStatus || '—'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading || !!busyKey}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void sendTestToMe()}
            disabled={loading || !!busyKey}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {busyKey === 'test' ? 'Sending…' : 'Send test to me'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-sm rounded border p-3 ${message.type === 'success' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : 'border-red-800 bg-red-950/30 text-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">System status</div>
          <div className="text-sm text-gray-300 space-y-2">
            <div>
              <span className="text-gray-400">Webhook:</span>{' '}
              {status?.webhook ? (
                <span className="font-mono">{String(status.webhook?.url || 'configured')}</span>
              ) : status?.webhookError ? (
                <span className="text-red-300">{status.webhookError}</span>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
            <div>
              <span className="text-gray-400">Linked users:</span> <span className="font-semibold">{diag?.linkedUsers ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">Enabled users:</span> <span className="font-semibold">{diag?.enabledUsers ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">Active users:</span> <span className="font-semibold">{diag?.activeUsers ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">Failed sends (all time):</span> <span className="font-semibold">{diag?.failedSends ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">Controls</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-200">Global automation sending</div>
                <div className="text-xs text-gray-500">Pauses bulk Telegram sends (does not affect interactive bot menus).</div>
              </div>
              <button
                type="button"
                onClick={() => void toggle('global', !(automations?.settings?.globalEnabled ?? true))}
                disabled={!!busyKey}
                className={`px-3 py-2 rounded-md text-sm font-semibold ${
                  (automations?.settings?.globalEnabled ?? true)
                    ? 'bg-amber-700 text-white hover:bg-amber-600'
                    : 'bg-emerald-700 text-white hover:bg-emerald-600'
                } disabled:opacity-60`}
              >
                {busyKey === 'toggle:global'
                  ? 'Saving…'
                  : (automations?.settings?.globalEnabled ?? true)
                    ? 'Pause'
                    : 'Resume'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-200">Gold signals automation</div>
                <div className="text-xs text-gray-500">Controls Telegram sends from `/api/cron/gold-signals`.</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle('gold_signals', !(automations?.settings?.goldSignalsEnabled ?? true))}
                  disabled={!!busyKey}
                  className={`px-3 py-2 rounded-md text-sm font-semibold ${
                    (automations?.settings?.goldSignalsEnabled ?? true)
                      ? 'bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700'
                      : 'bg-emerald-700 text-white hover:bg-emerald-600'
                  } disabled:opacity-60`}
                >
                  {busyKey === 'toggle:gold_signals'
                    ? 'Saving…'
                    : (automations?.settings?.goldSignalsEnabled ?? true)
                      ? 'Disable'
                      : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => void runAutomation('gold_signals')}
                  disabled={!!busyKey}
                  className="px-3 py-2 rounded-md text-sm font-semibold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  {busyKey === 'run:gold_signals' ? 'Running…' : 'Run now'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-200">Notification rules automation</div>
                <div className="text-xs text-gray-500">Controls Telegram sends from `/api/cron/notify` rules.</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle('notify_rules', !(automations?.settings?.notifyRulesEnabled ?? true))}
                  disabled={!!busyKey}
                  className={`px-3 py-2 rounded-md text-sm font-semibold ${
                    (automations?.settings?.notifyRulesEnabled ?? true)
                      ? 'bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700'
                      : 'bg-emerald-700 text-white hover:bg-emerald-600'
                  } disabled:opacity-60`}
                >
                  {busyKey === 'toggle:notify_rules'
                    ? 'Saving…'
                    : (automations?.settings?.notifyRulesEnabled ?? true)
                      ? 'Disable'
                      : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => void runAutomation('notify_rules')}
                  disabled={!!busyKey}
                  className="px-3 py-2 rounded-md text-sm font-semibold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  {busyKey === 'run:notify_rules' ? 'Running…' : 'Run now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
        <div className="text-sm font-semibold text-gray-100 mb-3">Recent Telegram deliveries</div>
        <div className="overflow-auto">
          <table className="min-w-full text-xs text-gray-200">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-2 pr-3">time</th>
                <th className="text-left py-2 pr-3">status</th>
                <th className="text-left py-2 pr-3">source</th>
                <th className="text-left py-2 pr-3">user</th>
                <th className="text-left py-2 pr-3">error</th>
              </tr>
            </thead>
            <tbody>
              {(logs?.rows ?? []).map((r: any) => (
                <tr key={String(r.id)} className="border-t border-gray-900">
                  <td className="py-2 pr-3">{r.created_at ? formatWhen(r.created_at) : '—'}</td>
                  <td className="py-2 pr-3">{String(r.status || '—')}</td>
                  <td className="py-2 pr-3 font-mono">{String(r.payload?.source || '—')}</td>
                  <td className="py-2 pr-3 font-mono">{r.user_id ? String(r.user_id).slice(0, 8) : '—'}</td>
                  <td className="py-2 pr-3 text-red-200">{r.error ? String(r.error) : '—'}</td>
                </tr>
              ))}
              {(!logs || (logs.rows ?? []).length === 0) && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={5}>
                    No Telegram deliveries found.
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
