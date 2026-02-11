import { NextRequest, NextResponse } from 'next/server';

import { getServerUser } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const { searchParams } = new URL(req.url);
  const merchantOrderId = searchParams.get('merchant_order_id');
  if (!merchantOrderId) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'merchant_order_id required' }, { status: 400 }));
  }

  const supabase = getServerClient();
  const { data: order, error } = await supabase
    .from('paymob_orders')
    .select('merchant_order_id, plan, amount_egp, currency, status, paymob_order_id, created_at, updated_at, user_id')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();

  if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
  if (!order) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 }));
  if ((order as any).user_id !== user.id) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }));
  }

  const status = await getUserPremiumStatus();

  // Never return payment key.
  const safeOrder = {
    merchant_order_id: (order as any).merchant_order_id,
    plan: (order as any).plan,
    amount_egp: (order as any).amount_egp,
    currency: (order as any).currency,
    status: (order as any).status,
    paymob_order_id: (order as any).paymob_order_id ?? null,
    created_at: (order as any).created_at,
    updated_at: (order as any).updated_at,
  };

  return withNoStoreHeaders(NextResponse.json({ ok: true, order: safeOrder, premium: status }, { status: 200 }));
}

