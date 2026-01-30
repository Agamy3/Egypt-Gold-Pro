import { isAdminUser } from '@/lib/auth/admin';
import Header from '@/components/layout/Header';
import { getServerUser } from '@/lib/supabase/server-auth';
import { redirect } from 'next/navigation';
import AlpacaPaperDashboard from '@/components/admin/AlpacaPaperDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminAlpacaPaperPage() {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    return (
      <main className="flex-1 min-w-0">
        <Header title="Alpaca Paper Trading" subtitle="Forbidden" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-5 text-red-200">
            <div className="text-lg font-semibold">403 — Forbidden</div>
            <div className="mt-2 text-sm text-red-200/90">You don’t have access to this admin tool.</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0">
      <Header title="Alpaca Paper Trading" subtitle="Admin-only paper trading dashboard (safe, no real trades)" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AlpacaPaperDashboard />
      </div>
    </main>
  );
}

