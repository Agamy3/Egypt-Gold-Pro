'use client';

import { useEffect, useState } from 'react';

type PaymobOrderRow = {
  merchant_order_id: string;
  user_id: string;
  plan: string;
  amount_egp: number;
  currency: string;
  status: string;
  paymob_order_id: string | null;
  created_at: string;
  updated_at: string;
};

type WebhookEventRow = {
  id: number;
  event_type: string;
  paymob_transaction_id: string | null;
  paymob_order_id: string | null;
  merchant_order_id: string | null;
  verified_hmac: boolean;
  processed: boolean;
  created_at: string;
};

type ListResponse = {
  ok: boolean;
  error?: string;
  orders: PaymobOrderRow[];
  events: WebhookEventRow[];
  serverAsOf: string;
};

export default function PaymobBillingPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/billing/paymob/list', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as ListResponse | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const refreshEntitlement = async (merchantOrderId: string) => {
    setRefreshing(merchantOrderId);
    setError(null);
    try {
      const res = await fetch('/api/admin/billing/paymob/refresh-entitlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_order_id: merchantOrderId }),
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Refresh failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-400">Paymob billing</div>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">Latest orders</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs text-gray-200">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2 pr-3">merchant_order_id</th>
                  <th className="text-left py-2 pr-3">status</th>
                  <th className="text-left py-2 pr-3">plan</th>
                  <th className="text-left py-2 pr-3">amount</th>
                  <th className="text-left py-2 pr-3">updated</th>
                  <th className="text-left py-2 pr-3">actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.orders ?? []).map((o) => (
                  <tr key={o.merchant_order_id} className="border-t border-gray-900">
                    <td className="py-2 pr-3 font-mono">{o.merchant_order_id}</td>
                    <td className="py-2 pr-3">{o.status}</td>
                    <td className="py-2 pr-3">{o.plan}</td>
                    <td className="py-2 pr-3">
                      {o.amount_egp} {o.currency}
                    </td>
                    <td className="py-2 pr-3">{new Date(o.updated_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => void refreshEntitlement(o.merchant_order_id)}
                        disabled={refreshing !== null}
                        className="px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-60"
                        title="Idempotent: won’t re-extend if already refreshed for this order"
                      >
                        {refreshing === o.merchant_order_id ? 'Working…' : 'Refresh entitlement'}
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data || data.orders.length === 0) && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={6}>
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="text-sm font-semibold text-gray-100 mb-3">Latest webhook events</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs text-gray-200">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2 pr-3">id</th>
                  <th className="text-left py-2 pr-3">type</th>
                  <th className="text-left py-2 pr-3">verified</th>
                  <th className="text-left py-2 pr-3">processed</th>
                  <th className="text-left py-2 pr-3">merchant</th>
                  <th className="text-left py-2 pr-3">created</th>
                </tr>
              </thead>
              <tbody>
                {(data?.events ?? []).map((ev) => (
                  <tr key={ev.id} className="border-t border-gray-900">
                    <td className="py-2 pr-3 font-mono">{ev.id}</td>
                    <td className="py-2 pr-3">{ev.event_type}</td>
                    <td className="py-2 pr-3">{ev.verified_hmac ? 'yes' : 'no'}</td>
                    <td className="py-2 pr-3">{ev.processed ? 'yes' : 'no'}</td>
                    <td className="py-2 pr-3 font-mono">{ev.merchant_order_id ?? '—'}</td>
                    <td className="py-2 pr-3">{new Date(ev.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {(!data || data.events.length === 0) && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={6}>
                      No events found.
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

