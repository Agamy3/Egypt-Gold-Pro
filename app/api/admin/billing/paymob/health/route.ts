import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getPaymobConfig, PaymobConfigError } from '@/lib/paymob/config';
import { authToken, createOrder, createPaymentKey, isPaymobHttpError } from '@/lib/paymob/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(_req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    let cfg;
    try {
      cfg = getPaymobConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[paymob:health] config invalid', { requestId, error: msg });
      const safe = e instanceof PaymobConfigError ? `invalid_config:${e.field}` : 'invalid_config';
      return withNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            step: 'config',
            baseUrl: null,
            integrationIdCard: null,
            authOk: false,
            orderOk: false,
            paymentKeyOk: false,
            details: { error: safe },
          },
          { status: 500 }
        )
      );
    }

    const out: any = {
      ok: false,
      baseUrl: cfg.baseUrl,
      integrationIdCard: cfg.integrationIdCard,
      authOk: false,
      orderOk: false,
      paymentKeyOk: false,
      step: 'auth' as 'auth' | 'order' | 'payment_key' | 'done',
      details: {},
    };

    let token: string;
    try {
      token = await authToken({ apiKey: cfg.apiKey, requestId });
      out.authOk = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.step = 'auth';
      out.details = { error: msg };
      return withNoStoreHeaders(NextResponse.json(out, { status: 502 }));
    }

    const merchantOrderId = `health_${crypto.randomUUID()}`;

    let paymobOrderId: number;
    try {
      const order = await createOrder({
        authToken: token,
        merchantOrderId,
        amountCents: 100,
        currency: 'EGP',
        planLabel: 'health_check',
        requestId,
      });
      paymobOrderId = order.id;
      out.orderOk = true;
    } catch (e) {
      out.step = 'order';
      out.details = isPaymobHttpError(e)
        ? { status: e.status, url: e.url, responsePreview: e.responsePreview }
        : { error: e instanceof Error ? e.message : String(e) };
      return withNoStoreHeaders(NextResponse.json(out, { status: 502 }));
    }

    try {
      const paymentKey = await createPaymentKey({
        authToken: token,
        paymobOrderId,
        amountCents: 100,
        currency: 'EGP',
        billingData: {
          email: 'healthcheck@egyptgoldpro.com',
          firstName: 'Health',
          lastName: 'Check',
          phone: '01000000000',
        },
        integrationIdCard: cfg.integrationIdCard,
        requestId,
        redirectUrl: `${cfg.appUrl.replace(/\/+$/, '')}/premium/success?merchant_order_id=${encodeURIComponent(merchantOrderId)}`,
        merchantOrderId,
      });

      out.paymentKeyOk = true;
      out.step = 'done';
      out.ok = true;
      out.details = {
        merchantOrderId,
        paymobOrderId,
        paymentKeyPrefix: paymentKey.slice(0, 12),
      };

      return withNoStoreHeaders(NextResponse.json(out, { status: 200 }));
    } catch (e) {
      out.step = 'payment_key';
      out.details = isPaymobHttpError(e)
        ? { status: e.status, url: e.url, responsePreview: e.responsePreview }
        : { error: e instanceof Error ? e.message : String(e) };

      // Improve common integration mismatch message.
      if (isPaymobHttpError(e) && e.status === 400 && e.responsePreview.includes('Invalid Payment method integration')) {
        out.details = {
          error:
            'invalid_integration: Check PAYMOB_INTEGRATION_ID_CARD is the LIVE Online Card integration for this PAYMOB_API_KEY.',
        };
      }

      return withNoStoreHeaders(NextResponse.json(out, { status: 502 }));
    }
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
