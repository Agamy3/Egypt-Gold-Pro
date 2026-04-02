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
    .select(
      'merchant_order_id, plan, amount_egp, currency, status, provider, geidea_order_id, geidea_status, created_at, updated_at, user_id'
    )
    .eq('merchant_order_id', merchantOrderId)
    .eq('provider', 'geidea')
    .maybeSingle();

  if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
  if (!order) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 }));
  if ((order as any).user_id !== user.id) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }));
  }

  const { data: ent } = await supabase
    .from('user_entitlements')
    .select('is_premium, premium_until, plan, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const status = await getUserPremiumStatus();

  const safeOrder = {
    merchant_order_id: (order as any).merchant_order_id,
    provider: (order as any).provider,
    plan: (order as any).plan,
    amount_egp: (order as any).amount_egp,
    currency: (order as any).currency,
    status: (order as any).status,
    geidea_order_id: (order as any).geidea_order_id ?? null,
    geidea_status: (order as any).geidea_status ?? null,
    created_at: (order as any).created_at,
    updated_at: (order as any).updated_at,
  };

  const safeEntitlement = ent
    ? {
        is_premium: Boolean((ent as any).is_premium),
        premium_until: ((ent as any).premium_until ?? null) as string | null,
        plan: ((ent as any).plan ?? null) as string | null,
        updated_at: (ent as any).updated_at ?? null,
      }
    : null;

  return withNoStoreHeaders(
    NextResponse.json({ ok: true, order: safeOrder, user_entitlements: safeEntitlement, premium: status }, { status: 200 })
  );
}
