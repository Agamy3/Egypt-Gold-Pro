import { requireAdmin } from '@/lib/auth/admin';
import Header from '@/components/layout/Header';
import ThirtySecondForecastPanel from '@/components/admin/ThirtySecondForecastPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminThirtySecondForecastPage() {
  // Server-side admin enforcement (do not rely on client gating).
  await requireAdmin();

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

