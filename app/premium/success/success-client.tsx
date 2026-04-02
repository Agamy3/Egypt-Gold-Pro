/**
 * Paymob return / success page (client).
 * Polls server for order status and premium activation.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountMenu from '@/components/AccountMenu';

type StatusResponse = {
  ok: boolean;
  error?: string;
  order?: {
    merchant_order_id: string;
    provider?: string;
    status: string;
    plan: string;
    amount_egp: number;
    currency: string;
    updated_at: string;
  };
  premium?: {
    isPremium: boolean;
    premiumExpiresAt: string | null;
  } | null;
};

async function fetchStatus(merchantOrderId: string): Promise<StatusResponse> {
  // Prefer Geidea for new orders; fall back to Paymob for legacy.
  const urls = [
    `/api/billing/geidea/status?merchant_order_id=${encodeURIComponent(merchantOrderId)}`,
    `/api/billing/paymob/status?merchant_order_id=${encodeURIComponent(merchantOrderId)}`,
  ];
  let lastErr: string | null = null;
  for (const url of urls) {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as StatusResponse | null;
    if (res.ok && json?.ok) return json;
    lastErr = json?.error || `Status failed (${res.status})`;
  }
  throw new Error(lastErr || 'Status failed');
}

export default function PremiumSuccessClient() {
  const sp = useSearchParams();
  const merchantFromUrl = sp.get('merchant_order_id');
  const merchant = useMemo(() => {
    if (merchantFromUrl) return merchantFromUrl;
    return window.localStorage.getItem('egp_last_merchant_order_id');
  }, [merchantFromUrl]);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchant) {
      setLoading(false);
      setError('Missing merchant_order_id');
      return;
    }

    let cancelled = false;
    let tries = 0;

    const run = async () => {
      tries++;
      try {
        const json = await fetchStatus(merchant);
        if (cancelled) return;
        setResult(json);

        const status = String(json.order?.status || '');
        if (status === 'paid' || status === 'failed' || status === 'canceled') {
          setLoading(false);
          return;
        }

        if (tries >= 60) {
          setLoading(false);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Status request failed');
        setLoading(false);
        return;
      }

      setTimeout(run, 3000);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [merchant]);

  const status = result?.order?.status || null;
  const isPaid = status === 'paid';

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold text-gold-400">EgyptGold Pro</span>
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl font-bold text-white">Payment Status</h1>
        <p className="mt-2 text-sm text-gray-400">We’ll confirm your payment and activate Premium automatically.</p>

        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
          {error ? (
            <div className="text-red-300 text-sm">{error}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
                <span className="rounded bg-gray-900 px-2 py-1">Order: {merchant ?? '—'}</span>
                <span className="rounded bg-gray-900 px-2 py-1">Status: {status ?? (loading ? 'checking…' : 'unknown')}</span>
              </div>

              {isPaid ? (
                <div className="mt-4 rounded-lg border border-green-800 bg-green-950/30 p-4 text-green-200">
                  Premium activated. Thank you!
                </div>
              ) : status === 'failed' ? (
                <div className="mt-4 rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-200">
                  Payment failed. You can try again from the Premium page.
                </div>
              ) : (
                <div className="mt-4 text-sm text-gray-400">{loading ? 'Waiting for confirmation…' : 'Still pending.'}</div>
              )}

              <div className="mt-4 text-xs text-gray-500">
                Premium: {result?.premium?.isPremium ? 'Active' : 'Not active'}{' '}
                {result?.premium?.premiumExpiresAt ? `(until ${new Date(result.premium.premiumExpiresAt).toLocaleDateString()})` : ''}
              </div>
            </>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Link href="/premium" className="px-4 py-2 rounded-md bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700">
              Back to Premium
            </Link>
            <Link href="/" className="px-4 py-2 rounded-md bg-gold-600 text-white hover:bg-gold-700">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

