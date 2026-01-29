import { isAdminUser } from '@/lib/auth/admin';
import Header from '@/components/layout/Header';
import ThirtySecondForecastPanel from '@/components/admin/ThirtySecondForecastPanel';
import { getServerUser } from '@/lib/supabase/server-auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminThirtySecondForecastPage() {
  // Server-side admin enforcement (do not rely on client gating).
  // Do NOT throw here (would render a generic 500 "Application error").
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    return (
      <main className="flex-1 min-w-0">
        <Header title="Admin 30s Global Ounce Forecast" subtitle="Forbidden" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-5 text-red-200">
            <div className="text-lg font-semibold">403 — Forbidden</div>
            <div className="mt-2 text-sm text-red-200/90">
              You don’t have access to this admin tool.
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0">
      <Header title="Admin 30s Global Ounce Forecast" subtitle="Rolling 30-second predictions + validation + $10 notional trade simulation" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ThirtySecondForecastPanel />
        <div className="mt-6 text-xs text-gray-500">
          Note: this loop runs only while this page is open (client calls the server tick endpoint every 30s).
        </div>
      </div>
    </main>
  );
}

