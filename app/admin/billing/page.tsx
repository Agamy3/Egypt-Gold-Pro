import Header from '@/components/layout/Header';
import { getServerUser } from '@/lib/supabase/server-auth';
import { isAdminUser } from '@/lib/auth/admin';
import { redirect } from 'next/navigation';
import PaymobBillingPanel from '@/components/admin/PaymobBillingPanel';
import DefaultPremiumSettings from '@/components/admin/DefaultPremiumSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminBillingPage() {
  const user = await getServerUser();
  if (!user) redirect('/auth/signin');

  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    return (
      <main className="flex-1 min-w-0">
        <Header title="Admin Billing" subtitle="Forbidden" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-5 text-red-200">
            <div className="text-lg font-semibold">403 — Forbidden</div>
            <div className="mt-2 text-sm text-red-200/90">You don't have access to this admin tool.</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0">
      <Header title="Admin Billing" subtitle="Paymob orders and webhooks" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <DefaultPremiumSettings />
        <PaymobBillingPanel />
      </div>
    </main>
  );
}

