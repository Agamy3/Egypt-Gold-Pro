'use client';

import { useState } from 'react';

interface TestPushPanelProps {
  defaultTarget?: 'me' | 'all';
}

export default function TestPushPanel({ defaultTarget = 'me' }: TestPushPanelProps) {
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<'me' | 'all'>(defaultTarget);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTestPush = async () => {
    setLoading(true);
    setMessage(null);
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

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-6">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">Send Test Push Notification</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Target:</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as 'me' | 'all')}
            className="px-3 py-2 rounded-md text-sm bg-gray-800 text-gray-200 border border-gray-700"
            disabled={loading}
          >
            <option value="me">Me</option>
            <option value="all">All (latest 50)</option>
          </select>
          <button
            type="button"
            onClick={handleTestPush}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send test push'}
          </button>
        </div>
        {message && (
          <div className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
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
