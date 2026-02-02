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

        <div className="text-xs text-gray-500 mt-4">
          <p>Note: Push notifications require the app to be installed to Home Screen on iOS.</p>
          <p className="mt-1">On Android, notifications work in the browser after permission is granted.</p>
        </div>
      </div>
    </div>
  );
}
