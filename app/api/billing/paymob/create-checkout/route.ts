import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';
import { authToken, createOrder, createPaymentKey, buildHostedPaymentUrl, isPaymobHttpError } from '@/lib/paymob/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Plan = 'premium_monthly' | 'premium_yearly';

const PRICES_EGP: Record<Plan, number> = {
  premium_monthly: 99,
  premium_yearly: 899,
};

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

function normalizeEgyptPhone(input: string): string {
  const raw = String(input || '').trim();
  const digits = raw.replace(/[^\d]/g, '');

  // Prefer a substring that looks like a local Egyptian mobile: 01XXXXXXXXX
  const match = digits.match(/01\d{9}/);
  if (match) return match[0]!;

  let d = digits;
  if (d.startsWith('0020')) d = d.slice(4);
  if (d.startsWith('20')) d = d.slice(2);

  if (d.length === 11 && d.startsWith('01')) return d;

  // Fallback to a safe placeholder that passes validation
  return '01000000000';
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await getServerUser();
    if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

    const supabaseAdmin = getServerClient();

    // Basic per-user rate limiting: max 3 create-checkout/minute (DB-backed; works across instances).
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rlErr } = await supabaseAdmin
      .from('paymob_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if (rlErr) {
      console.error('[paymob:create-checkout] rate limit query failed', { requestId, message: rlErr.message });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Please try again' }, { status: 503 }));
    }
    if ((recentCount ?? 0) >= 3) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'Too many checkout attempts. Please wait 1 minute and try again.' }, { status: 429 })
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
    const phoneRaw = String((profile as any)?.phone || user.user_metadata?.phone || '');
    const phone = normalizeEgyptPhone(phoneRaw || '+201000000000');

    // 1) Insert initiated order
    let step: string = 'db_insert_order';
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
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Failed to create order', step }, { status: 500 }));
    }

    // 2) Paymob flow
    step = 'env_validation';
    const apiKey = process.env.PAYMOB_API_KEY || '';
    const integrationIdCard = Number(process.env.PAYMOB_INTEGRATION_ID_CARD || '');
    // PAYMOB_IFRAME_ID is optional/unused (we use hosted payment page redirect, not iframe)
    if (!apiKey || !integrationIdCard) {
      console.error('[paymob:create-checkout] missing env', { requestId, hasApiKey: Boolean(apiKey), integrationIdCard });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Billing not configured', step }, { status: 500 }));
    }

    let paymobOrderId: number | null = null;
    let paymentKey: string | null = null;
    try {
      step = 'paymob_auth';
      const token = await authToken({ apiKey, requestId });
      step = 'paymob_create_order';
      const order = await createOrder({
        authToken: token,
        merchantOrderId,
        amountCents,
        currency: 'EGP',
        planLabel: plan,
        requestId,
      });
      paymobOrderId = order.id;
      step = 'paymob_payment_key';
      paymentKey = await createPaymentKey({
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const paymobMeta =
        isPaymobHttpError(e)
          ? {
              paymobStatus: e.status,
              paymobUrl: e.url,
              paymobResponsePreview: e.responsePreview,
            }
          : null;

      console.error('[paymob:create-checkout] paymob flow failed', {
        requestId,
        merchantOrderId,
        paymobOrderId,
        integrationIdCard,
        step,
        error: msg,
        ...(paymobMeta || {}),
      });

      // mark order failed for observability (do not store secrets)
      await supabaseAdmin
        .from('paymob_orders')
        .update({
          status: 'failed',
          paymob_order_id: paymobOrderId ? String(paymobOrderId) : null,
        })
        .eq('merchant_order_id', merchantOrderId);

      // Surface a clearer configuration error for the common Paymob integration mismatch.
      if (isPaymobHttpError(e) && e.status === 400 && e.responsePreview.includes('Invalid Payment method integration')) {
        return withNoStoreHeaders(
          NextResponse.json(
            {
              ok: false,
              error: `Billing misconfigured (invalid Paymob integration). Check PAYMOB_INTEGRATION_ID_CARD is the LIVE Online Card integration_id for this PAYMOB_API_KEY. integration_id=${integrationIdCard}. (requestId: ${requestId})`,
              step,
            },
            { status: 500 }
          )
        );
      }

      return withNoStoreHeaders(
        NextResponse.json(
          { ok: false, error: `Payment provider error (requestId: ${requestId})`, step },
          { status: 502 }
        )
      );
    }

    if (!paymentKey || !paymobOrderId) {
      step = 'paymob_missing_payment_key';
      await supabaseAdmin.from('paymob_orders').update({ status: 'failed' }).eq('merchant_order_id', merchantOrderId);
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: `Payment provider error (requestId: ${requestId})`, step }, { status: 502 })
      );
    }

    // 3) Persist Paymob ids (paymentKey stored server-side only)
    step = 'db_update_order';
    const { error: updErr } = await supabaseAdmin
      .from('paymob_orders')
      .update({
        paymob_order_id: String(paymobOrderId),
        paymob_payment_key: paymentKey,
        status: 'pending',
      })
      .eq('merchant_order_id', merchantOrderId);

    if (updErr) {
      console.error('[paymob:create-checkout] update order failed', { requestId, code: updErr.code, message: updErr.message });
      // We can still return checkout url; webhook will resolve status via merchant_order_id.
    }

    // Hosted Paymob payment page (no iframe id required)
    const checkoutUrl = buildHostedPaymentUrl({ paymentKey });

    console.log('[paymob:create-checkout] created', {
      requestId,
      userId: user.id,
      plan,
      amountEgp,
      merchantOrderId,
      paymobOrderId,
    });

    return withNoStoreHeaders(NextResponse.json({ ok: true, merchant_order_id: merchantOrderId, checkout_url: checkoutUrl }));
  } catch (e) {
    console.error('[paymob:create-checkout] error', { requestId, message: e instanceof Error ? e.message : String(e) });
    return withNoStoreHeaders(
      NextResponse.json({ ok: false, error: `Internal server error (requestId: ${requestId})`, step: 'unknown' }, { status: 500 })
    );
  }
}

