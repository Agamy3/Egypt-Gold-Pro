/**
 * Pending page client: poll status until paid/failed.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type StatusResponse = {
  ok: boolean;
  error?: string;
  order?: { status: string; updated_at: string };
  premium?: { isPremium: boolean; premiumExpiresAt: string | null } | null;
};

async function fetchStatus(merchantOrderId: string): Promise<StatusResponse> {
  const urls = [
    `/api/billing/geidea/status?merchant_order_id=${encodeURIComponent(merchantOrderId)}`,
    `/api/billing/paymob/status?merchant_order_id=${encodeURIComponent(merchantOrderId)}`,
  ];
  let lastErr: string | null = null;
  for (const url of urls) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as StatusResponse | null;
    if (res.ok && json?.ok) return json;
    lastErr = json?.error || `Status failed (${res.status})`;
  }
  throw new Error(lastErr || 'Status failed');
}

export default function PendingClient(props: { merchantOrderId: string; checkoutUrl: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const json = await fetchStatus(props.merchantOrderId);
        if (cancelled) return;
        const s = String(json.order?.status || 'pending');
        setStatus(s);
        if (s === 'paid') router.replace(`/premium/success?merchant_order_id=${encodeURIComponent(props.merchantOrderId)}`);
        if (s === 'failed' || s === 'canceled')
          router.replace(`/premium/failed?merchant_order_id=${encodeURIComponent(props.merchantOrderId)}`);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Status error');
      }
    };

    poll();
    const t = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [props.merchantOrderId, router]);

  return (
    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
      <div className="text-sm text-gray-300">Status: {status}</div>
      {error && <div className="mt-2 text-sm text-red-300">{error}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={props.checkoutUrl}
          className="px-4 py-2 rounded-md bg-gold-600 text-white hover:bg-gold-700"
          rel="noreferrer"
        >
          Open payment page
        </a>
        <a
          href={`/premium/success?merchant_order_id=${encodeURIComponent(props.merchantOrderId)}`}
          className="px-4 py-2 rounded-md bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700"
        >
          Check status
        </a>
      </div>
    </div>
  );
}

