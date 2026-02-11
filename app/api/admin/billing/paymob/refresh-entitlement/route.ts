import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { applyPremiumEntitlementForUser } from '@/lib/billing/applyPremiumEntitlement';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    const body = (await req.json().catch(() => null)) as { merchant_order_id?: string } | null;
    const merchantOrderId = String(body?.merchant_order_id || '').trim();
    if (!merchantOrderId) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'merchant_order_id required' }, { status: 400 }));
    }

    const { data: order, error } = await supabase
      .from('paymob_orders')
      .select('id, user_id, plan, status, paymob_order_id, merchant_order_id, entitlement_applied_at, entitlement_applied_until')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();
    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    if (!order) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 }));

    if (String((order as any).status) !== 'paid') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Order is not paid' }, { status: 409 }));
    }

    if ((order as any).entitlement_applied_at) {
      return withNoStoreHeaders(
        NextResponse.json(
          { ok: true, deduped: true, premiumUntil: (order as any).entitlement_applied_until ?? null },
          { status: 200 }
        )
      );
    }

    // Idempotency guard: create a synthetic unique transaction id for manual refresh.
    const syntheticTxnId = `manual_refresh:${merchantOrderId}`;
    try {
      await supabase.from('paymob_webhook_events').insert({
        event_type: 'manual_refresh',
        paymob_transaction_id: syntheticTxnId,
        paymob_order_id: (order as any).paymob_order_id ?? null,
        merchant_order_id: merchantOrderId,
        raw: { merchant_order_id: merchantOrderId, source: 'admin_refresh' },
        verified_hmac: true,
        processed: false,
      });
    } catch (e: any) {
      // If already exists (unique), treat as already refreshed.
      const msg = e?.message || '';
      if (String(e?.code) === '23505' || msg.includes('duplicate')) {
        return withNoStoreHeaders(NextResponse.json({ ok: true, deduped: true }, { status: 200 }));
      }
      throw e;
    }

    const now = new Date();
    const { premiumUntil } = await applyPremiumEntitlementForUser({
      userId: String((order as any).user_id),
      plan: (order as any).plan,
      merchantOrderId,
      now,
    });

    await supabase
      .from('paymob_orders')
      .update({
        entitlement_applied_at: now.toISOString(),
        entitlement_applied_until: premiumUntil,
      })
      .eq('id', (order as any).id);

    await supabase.from('paymob_webhook_events').update({ processed: true }).eq('paymob_transaction_id', syntheticTxnId);
    return withNoStoreHeaders(NextResponse.json({ ok: true, premiumUntil }, { status: 200 }));
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

