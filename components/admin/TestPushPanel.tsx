'use client';

import { useState } from 'react';

interface TestPushPanelProps {
  defaultTarget?: 'me' | 'all';
}

export default function TestPushPanel({ defaultTarget = 'me' }: TestPushPanelProps) {
  const [loading, setLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [target, setTarget] = useState<'me' | 'all'>(defaultTarget);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [debugResult, setDebugResult] = useState<any>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgStatsLoading, setTgStatsLoading] = useState(false);
  const [tgStats, setTgStats] = useState<any>(null);
  const [zonePrice, setZonePrice] = useState('4180');
  const [tgMode, setTgMode] = useState<'test' | 'signal'>('signal');
  const [tgPreview, setTgPreview] = useState<any>(null);
  const [tgDryRun, setTgDryRun] = useState(true);

  const handleTestPush = async () => {
    setLoading(true);
    setMessage(null);
    setDebugResult(null);
    try {
      const res = await fetch('/api/admin/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
        cache: 'no-store',
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Test push failed (${res.status})`);
      }

      setMessage({
        type: 'success',
        text: `Test notification sent to ${json.sent} device(s). ${json.failed > 0 ? `${json.failed} failed.` : ''}`,
      });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to send test push',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDebugCycle = async () => {
    setDebugLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/notifications/debug-cycle', { method: 'GET', cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Debug cycle failed (${res.status})`);
      }
      setDebugResult(json);
      setMessage({ type: 'success', text: 'Dry-run cycle completed. See diagnostics below.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Debug cycle failed' });
    } finally {
      setDebugLoading(false);
    }
  };

  const handleTelegramStats = async () => {
    setTgStatsLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/test-telegram', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setTgStats(json);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load Telegram diagnostics' });
    } finally {
      setTgStatsLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    setTgLoading(true);
    setMessage(null);
    try {
      const price = Number(zonePrice);
      const res = await fetch('/api/admin/notifications/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          target,
          mode: tgMode,
          dryRun: tgDryRun,
          priceUsd: isFinite(price) ? price : undefined,
          action: price >= 5200 ? 'SELL' : 'BUY',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setTgPreview(json.preview || null);
      setMessage({
        type: 'success',
        text: json.dryRun
          ? `Telegram dry run ready for ${json.recipients} recipient(s).`
          : `Telegram sent to ${json.sent} user(s). ${json.failed > 0 ? `${json.failed} failed.` : ''}`,
      });
      await handleTelegramStats();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send Telegram test' });
    } finally {
      setTgLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-6">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">Notifications Debug</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Test push target:</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as 'me' | 'all')}
            className="px-3 py-2 rounded-md text-sm bg-gray-800 text-gray-200 border border-gray-700"
            disabled={loading || debugLoading}
          >
            <option value="me">Me</option>
            <option value="all">All (latest 50)</option>
          </select>
          <button
            type="button"
            onClick={handleTestPush}
            disabled={loading || debugLoading}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send test push'}
          </button>

          <button
            type="button"
            onClick={handleDebugCycle}
            disabled={loading || debugLoading}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {debugLoading ? 'Running...' : 'Run debug cycle (dry run)'}
          </button>

          <button
            type="button"
            onClick={handleTelegramStats}
            disabled={loading || debugLoading || tgStatsLoading}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tgStatsLoading ? 'Loading...' : 'Telegram diagnostics'}
          </button>
        </div>
        {message && (
          <div className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </div>
        )}

        {debugResult && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
              <span className="rounded bg-gray-950/40 px-2 py-1">rulesLoaded: {debugResult.rulesLoaded}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">evaluated: {debugResult.evaluated}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">triggered: {debugResult.triggered}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">sent: {debugResult.sent}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">failed: {debugResult.failed}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">skipped: {debugResult.skipped}</span>
            </div>
            <pre className="mt-3 max-h-80 overflow-auto rounded bg-black/40 p-3 text-xs text-gray-200">
              {JSON.stringify(debugResult, null, 2)}
            </pre>
          </div>
        )}

        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-100">Telegram Test + Zone Preview</div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={tgMode}
              onChange={(e) => setTgMode(e.target.value as 'test' | 'signal')}
              className="px-3 py-2 rounded-md text-sm bg-gray-800 text-gray-200 border border-gray-700"
            >
              <option value="signal">Signal format (zone-based)</option>
              <option value="test">Simple test</option>
            </select>
            <input
              type="number"
              value={zonePrice}
              onChange={(e) => setZonePrice(e.target.value)}
              className="px-3 py-2 rounded-md text-sm bg-gray-800 text-gray-200 border border-gray-700 w-40"
              placeholder="XAU/USD"
            />
            <label className="text-xs text-gray-300 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={tgDryRun}
                onChange={(e) => setTgDryRun(e.target.checked)}
              />
              Dry run
            </label>
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={tgLoading}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {tgLoading ? 'Sending...' : (tgDryRun ? 'Preview Telegram' : 'Send test Telegram')}
            </button>
          </div>
          {tgPreview && (
            <pre className="max-h-64 overflow-auto rounded bg-black/40 p-3 text-xs text-gray-200">
              {JSON.stringify(tgPreview, null, 2)}
            </pre>
          )}
          {tgStats && (
            <div className="text-xs text-gray-300 flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-950/40 px-2 py-1">linked: {tgStats.linkedUsers ?? 0}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">enabled: {tgStats.enabledUsers ?? 0}</span>
              <span className="rounded bg-gray-950/40 px-2 py-1">latest events: {(tgStats.latestDeliveries || []).length}</span>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500 mt-4">
          <p>Note: Push notifications require the app to be installed to Home Screen on iOS.</p>
          <p className="mt-1">On Android, notifications work in the browser after permission is granted.</p>
        </div>
      </div>
    </div>
  );
}
