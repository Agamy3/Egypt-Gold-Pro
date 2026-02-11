import Link from 'next/link';
import { redirect } from 'next/navigation';

import AccountMenu from '@/components/AccountMenu';
import { getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PremiumFailedPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getServerUser();
  if (!user) redirect('/auth/signin');

  const sp = await props.searchParams;
  const merchantOrderIdRaw = sp.merchant_order_id;
  const merchantOrderId = Array.isArray(merchantOrderIdRaw) ? merchantOrderIdRaw[0] : merchantOrderIdRaw;

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
        <h1 className="text-2xl font-bold text-white">Payment failed</h1>
        <p className="mt-2 text-sm text-gray-400">Your payment wasn’t completed. You can try again.</p>
        {merchantOrderId && (
          <div className="mt-4 text-xs text-gray-500">
            Order: <span className="font-mono">{merchantOrderId}</span>
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Link href="/premium" className="px-4 py-2 rounded-md bg-gold-600 text-white hover:bg-gold-700">
            Back to Premium
          </Link>
          <Link href="/" className="px-4 py-2 rounded-md bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

