import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const [{ data: orders }, { data: events }] = await Promise.all([
      supabase
        .from('paymob_orders')
        .select('merchant_order_id, user_id, plan, amount_egp, currency, status, paymob_order_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('paymob_webhook_events')
        .select('id, event_type, paymob_transaction_id, paymob_order_id, merchant_order_id, verified_hmac, processed, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        orders: (orders as any) ?? [],
        events: (events as any) ?? [],
        serverAsOf: new Date().toISOString(),
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

