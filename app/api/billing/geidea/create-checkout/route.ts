import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';
import { getGeideaConfig, GeideaConfigError } from '@/lib/geidea/config';
import { geideaTimestampNow } from '@/lib/geidea/signature';
import { buildHostedCheckoutUrl, createCheckoutSession, isGeideaHttpError } from '@/lib/geidea/client';

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

  const match = digits.match(/01\d{9}/);
  if (match) return match[0]!;

  let d = digits;
  if (d.startsWith('0020')) d = d.slice(4);
  if (d.startsWith('20')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('01')) return d;

  return '01000000000';
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await getServerUser();
    if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

    let cfg;
    try {
      cfg = getGeideaConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[geidea:create-checkout] config invalid', { requestId, error: msg });
      const safe = e instanceof GeideaConfigError ? `Billing not configured (${e.field})` : 'Billing not configured';
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: safe, step: 'env_validation' }, { status: 500 }));
    }

    const body = (await req.json().catch(() => null)) as { plan?: Plan } | null;
    const plan = body?.plan;
    if (plan !== 'premium_monthly' && plan !== 'premium_yearly') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 }));
    }

    const amountEgp = PRICES_EGP[plan];
    const merchantOrderId = `egp_${crypto.randomUUID()}`;

    const supabaseAdmin = getServerClient();

    // Basic per-user rate limiting: max 3 attempts/minute (same table; provider filtered)
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rlErr } = await supabaseAdmin
      .from('paymob_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('provider', 'geidea')
      .gte('created_at', windowStart);

    if (rlErr) {
      console.error('[geidea:create-checkout] rate limit query failed', { requestId, message: rlErr.message });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Please try again' }, { status: 503 }));
    }
    if ((recentCount ?? 0) >= 3) {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'Too many checkout attempts. Please wait 1 minute and try again.' }, { status: 429 })
      );
    }

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

    // Insert initiated order first
    let step: string = 'db_insert_order';
    const { error: insErr } = await supabaseAdmin.from('paymob_orders').insert({
      user_id: user.id,
      plan,
      amount_egp: amountEgp,
      currency: 'EGP',
      status: 'initiated',
      merchant_order_id: merchantOrderId,
      provider: 'geidea',
    });

    if (insErr) {
      console.error('[geidea:create-checkout] insert order failed', { requestId, code: insErr.code, message: insErr.message });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Failed to create order', step }, { status: 500 }));
    }

    try {
      step = 'geidea_create_session';
      const timestamp = geideaTimestampNow();

      const { sessionId, raw } = await createCheckoutSession({
        requestId,
        merchantReferenceId: merchantOrderId,
        amount: amountEgp,
        currency: 'EGP',
        paymentOperation: 'Pay',
        callbackUrl: cfg.callbackUrl,
        returnUrl: cfg.returnUrl,
        language: 'en',
        timestamp,
        customer: {
          email,
          firstName: first,
          lastName: last,
          phoneNumber: phone,
          phoneCountryCode: '+20',
        },
        order: {
          items: [
            {
              merchantItemId: plan,
              name: 'EgyptGold Pro Premium',
              description: plan,
              categories: 'subscription',
              count: 1,
              price: amountEgp,
              sku: plan,
            },
          ],
        },
      });

      const geideaOrderId = String((raw as any)?.order?.orderId || '').trim() || null;
      const geideaStatus = String((raw as any)?.order?.status || '').trim() || null;

      step = 'db_update_order';
      const { error: updErr } = await supabaseAdmin
        .from('paymob_orders')
        .update({
          status: 'pending',
          geidea_session_id: sessionId,
          geidea_order_id: geideaOrderId,
          geidea_status: geideaStatus,
        })
        .eq('merchant_order_id', merchantOrderId);

      if (updErr) {
        console.error('[geidea:create-checkout] update order failed', { requestId, code: updErr.code, message: updErr.message });
      }

      const checkoutUrl = buildHostedCheckoutUrl({ hppBaseUrl: cfg.hppBaseUrl, sessionId });

      console.log('[geidea:create-checkout] created', {
        requestId,
        userId: user.id,
        plan,
        amountEgp,
        merchantOrderId,
        geideaOrderId,
      });

      return withNoStoreHeaders(
        NextResponse.json(
          { ok: true, provider: 'geidea', merchant_order_id: merchantOrderId, checkout_url: checkoutUrl },
          { status: 200 }
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[geidea:create-checkout] failed', {
        requestId,
        merchantOrderId,
        step,
        error: msg,
        ...(isGeideaHttpError(e)
          ? { geideaStatus: e.status, geideaUrl: e.url, geideaResponsePreview: e.responsePreview }
          : null),
      });

      await supabaseAdmin.from('paymob_orders').update({ status: 'failed' }).eq('merchant_order_id', merchantOrderId);

      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: `Payment provider error (requestId: ${requestId})`, step }, { status: 502 })
      );
    }
  } catch (e) {
    console.error('[geidea:create-checkout] error', { requestId, message: e instanceof Error ? e.message : String(e) });
    return withNoStoreHeaders(
      NextResponse.json({ ok: false, error: `Internal server error (requestId: ${requestId})`, step: 'unknown' }, { status: 500 })
    );
  }
}
