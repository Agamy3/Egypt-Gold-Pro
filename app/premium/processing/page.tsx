import Link from 'next/link';
import { redirect } from 'next/navigation';

import AccountMenu from '@/components/AccountMenu';
import { getServerUser } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';
import PaymobRedirectClient from './redirect-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function paymobPostUrl(): string {
  // Paymob's /pay endpoint appears to reject GET in production; use POST.
  return 'https://accept.paymob.com/api/acceptance/payments/pay';
}

export default async function PremiumProcessingPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getServerUser();
  if (!user) redirect('/auth/signin');

  const sp = await props.searchParams;
  const merchantOrderIdRaw = sp.merchant_order_id;
  const merchantOrderId = Array.isArray(merchantOrderIdRaw) ? merchantOrderIdRaw[0] : merchantOrderIdRaw;
  if (!merchantOrderId) {
    return (
      <div className="min-h-screen bg-black text-gray-200 p-10">
        Missing `merchant_order_id`. <Link className="text-gold-400" href="/premium">Back</Link>
      </div>
    );
  }

  const supabase = getServerClient();
  const { data: order, error } = await supabase
    .from('paymob_orders')
    .select('user_id, status, paymob_payment_key')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();

  if (error || !order) {
    return (
      <div className="min-h-screen bg-black text-gray-200 p-10">
        Order not found. <Link className="text-gold-400" href="/premium">Back</Link>
      </div>
    );
  }

  if ((order as any).user_id !== user.id) {
    return (
      <div className="min-h-screen bg-black text-gray-200 p-10">
        Forbidden. <Link className="text-gold-400" href="/premium">Back</Link>
      </div>
    );
  }

  const status = String((order as any).status || '');
  if (status === 'paid' || status === 'failed' || status === 'canceled') {
    redirect(`/premium/success?merchant_order_id=${encodeURIComponent(merchantOrderId)}`);
  }

  const paymentToken = String((order as any).paymob_payment_key || '');
  if (!paymentToken) {
    return (
      <div className="min-h-screen bg-black text-gray-200 p-10">
        Missing payment token. <Link className="text-gold-400" href="/premium">Back</Link>
      </div>
    );
  }

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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-gray-200">
        <h1 className="text-2xl font-bold text-white">Redirecting to payment…</h1>
        <p className="mt-2 text-sm text-gray-400">If you are not redirected automatically, click Continue.</p>

        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
          <PaymobRedirectClient actionUrl={paymobPostUrl()} paymentToken={paymentToken} />
          <div className="mt-4">
            <Link
              href={`/premium/success?merchant_order_id=${encodeURIComponent(merchantOrderId)}`}
              className="text-sm text-gold-400 hover:text-gold-300"
            >
              Check status
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

