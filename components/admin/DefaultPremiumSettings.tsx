'use client';

import { useEffect, useState } from 'react';

type SettingsResponse = {
  ok: boolean;
  error?: string;
  enabled: boolean;
  description?: string | null;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
};

export default function DefaultPremiumSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/default-premium', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as SettingsResponse | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setData(json);
      setEnabled(json.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/default-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as SettingsResponse | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Save failed (${res.status})`);
      setData(json);
      setEnabled(json.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">Default Premium for New Users</h3>
          <p className="text-sm text-gray-400">
            When enabled, all new user registrations will automatically receive premium status. This applies to all signups
            after the setting is enabled.
          </p>
          {data?.updated_at && (
            <p className="text-xs text-gray-500 mt-2">
              Last updated: {new Date(data.updated_at).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-300 bg-red-950/30 border border-red-800 rounded p-3">{error}</div>}

      <div className="flex items-center gap-4">
        <label className="inline-flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={loading || saving}
            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-gold-600 focus:ring-gold-500 focus:ring-2 disabled:opacity-50"
          />
          <span className="text-sm font-medium text-gray-200">
            {enabled ? 'Enabled' : 'Disabled'} — New users will {enabled ? 'receive' : 'not receive'} premium by default
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving || enabled === data?.enabled}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {enabled !== data?.enabled && (
          <button
            type="button"
            onClick={() => {
              setEnabled(data?.enabled ?? false);
              setError(null);
            }}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>

      {enabled && (
        <div className="mt-4 p-3 bg-yellow-950/30 border border-yellow-800 rounded text-sm text-yellow-200">
          <strong>Warning:</strong> This setting is currently enabled. All new user registrations will automatically receive
          premium status. Make sure this is intentional.
        </div>
      )}
    </div>
  );
}
