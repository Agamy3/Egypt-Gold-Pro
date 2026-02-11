import { Suspense } from 'react';
import PremiumSuccessClient from './success-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function PremiumSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-gray-200 p-10">Loading…</div>}>
      <PremiumSuccessClient />
    </Suspense>
  );
}

