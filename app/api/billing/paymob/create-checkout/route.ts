import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';
import { authToken, buildIframeCheckoutUrl, createOrder, createPaymentKey } from '@/lib/paymob/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Plan = 'premium_monthly' | 'premium_yearly';

const PRICES_EGP: Record<Plan, number> = {
  premium_monthly: 99,
  premium_yearly: 899,
};

// In-memory rate limit: max 3 requests/minute per user (best-effort; per-instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): { allowed: boolean; resetInSec?: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 3;
  const rec = rateLimitMap.get(userId);
  if (!rec || now > rec.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (rec.count >= max) return { allowed: false, resetInSec: Math.ceil((rec.resetAt - now) / 1000) };
  rec.count++;
  return { allowed: true };
}

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function splitName(displayName: string | null): { first: string; last: string } {
  const s = (displayName || '').trim();
  if (!s) return { first: 'EGP', last: 'User' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0]!, last: 'User' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await getServerUser();
    if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: `Rate limited. Try again in ${rl.resetInSec}s.` }, { status: 429 })
      );
    }

    const body = (await req.json().catch(() => null)) as { plan?: Plan } | null;
    const plan = body?.plan;
    if (plan !== 'premium_monthly' && plan !== 'premium_yearly') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 }));
    }

    const amountEgp = PRICES_EGP[plan];
    const amountCents = Math.round(amountEgp * 100);
    const merchantOrderId = `egp_${crypto.randomUUID()}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';
    const redirectUrl = `${appUrl.replace(/\/+$/, '')}/premium/success?merchant_order_id=${encodeURIComponent(merchantOrderId)}`;

    // Fetch billing info (RLS client)
    const supabaseRls = await createServerSupabaseClient();
    const { data: profile } = await supabaseRls
      .from('user_profiles')
      .select('email, display_name, phone')
      .eq('id', user.id)
      .maybeSingle();

    const email = (profile as any)?.email || user.email || '';
    if (!email) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Missing email on profile' }, { status: 400 }));
    }
    const { first, last } = splitName(((profile as any)?.display_name ?? null) as string | null);
    const phone = String((profile as any)?.phone || user.user_metadata?.phone || '+201000000000');

    const supabaseAdmin = getServerClient();

    // 1) Insert initiated order
    const { error: insErr } = await supabaseAdmin.from('paymob_orders').insert({
      user_id: user.id,
      plan,
      amount_egp: amountEgp,
      currency: 'EGP',
      status: 'initiated',
      merchant_order_id: merchantOrderId,
    });
    if (insErr) {
      console.error('[paymob:create-checkout] insert order failed', { requestId, code: insErr.code, message: insErr.message });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Failed to create order' }, { status: 500 }));
    }

    // 2) Paymob flow
    const apiKey = process.env.PAYMOB_API_KEY || '';
    const integrationIdCard = Number(process.env.PAYMOB_INTEGRATION_ID_CARD || '');
    const iframeId = process.env.PAYMOB_IFRAME_ID || '';
    if (!apiKey || !integrationIdCard || !iframeId) {
      console.error('[paymob:create-checkout] missing env', { requestId, hasApiKey: Boolean(apiKey), integrationIdCard, hasIframeId: Boolean(iframeId) });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Billing not configured' }, { status: 500 }));
    }

    const token = await authToken({ apiKey, requestId });
    const order = await createOrder({
      authToken: token,
      merchantOrderId,
      amountCents,
      currency: 'EGP',
      planLabel: plan,
      requestId,
    });
    const paymentKey = await createPaymentKey({
      authToken: token,
      paymobOrderId: order.id,
      amountCents,
      currency: 'EGP',
      billingData: { email, firstName: first, lastName: last, phone },
      integrationIdCard,
      requestId,
      redirectUrl,
      merchantOrderId,
    });

    // 3) Persist Paymob ids (paymentKey stored server-side only)
    const { error: updErr } = await supabaseAdmin
      .from('paymob_orders')
      .update({
        paymob_order_id: String(order.id),
        paymob_payment_key: paymentKey,
        status: 'pending',
      })
      .eq('merchant_order_id', merchantOrderId);

    if (updErr) {
      console.error('[paymob:create-checkout] update order failed', { requestId, code: updErr.code, message: updErr.message });
      // We can still return checkout url; webhook will resolve status via merchant_order_id.
    }

    const checkoutUrl = buildIframeCheckoutUrl({ iframeId, paymentKey });

    console.log('[paymob:create-checkout] created', {
      requestId,
      userId: user.id,
      plan,
      amountEgp,
      merchantOrderId,
      paymobOrderId: order.id,
    });

    return withNoStoreHeaders(NextResponse.json({ ok: true, merchant_order_id: merchantOrderId, checkout_url: checkoutUrl }));
  } catch (e) {
    console.error('[paymob:create-checkout] error', { requestId, message: e instanceof Error ? e.message : String(e) });
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 }));
  }
}

