import { NextRequest, NextResponse } from 'next/server';

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

function addDaysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function applyPremiumFromOrder(args: { userId: string; plan: 'premium_monthly' | 'premium_yearly'; now: Date }) {
  const supabase = getServerClient();
  const { data: profile } = await supabase.from('user_profiles').select('premium_expires_at').eq('id', args.userId).maybeSingle();
  const currentUntilMs = profile?.premium_expires_at ? Date.parse(String(profile.premium_expires_at)) : NaN;
  const base = Number.isFinite(currentUntilMs) && currentUntilMs > args.now.getTime() ? new Date(currentUntilMs) : args.now;
  const days = args.plan === 'premium_yearly' ? 365 : 30;
  const newUntil = addDaysFrom(base, days);

  const { error } = await supabase
    .from('user_profiles')
    .update({ is_premium: true, premium_expires_at: newUntil.toISOString() })
    .eq('id', args.userId);
  if (error) throw new Error(error.message);
  return newUntil.toISOString();
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
      .select('id, user_id, plan, status, paymob_order_id, merchant_order_id')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();
    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    if (!order) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 }));

    if (String((order as any).status) !== 'paid') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Order is not paid' }, { status: 409 }));
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

    const premiumUntil = await applyPremiumFromOrder({
      userId: (order as any).user_id,
      plan: (order as any).plan,
      now: new Date(),
    });

    await supabase.from('paymob_webhook_events').update({ processed: true }).eq('paymob_transaction_id', syntheticTxnId);
    return withNoStoreHeaders(NextResponse.json({ ok: true, premiumUntil }, { status: 200 }));
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

