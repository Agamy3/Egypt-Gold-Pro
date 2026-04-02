import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getGeideaConfig, GeideaConfigError } from '@/lib/geidea/config';
import { geideaTimestampNow } from '@/lib/geidea/signature';
import { createCheckoutSession, isGeideaHttpError } from '@/lib/geidea/client';

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
      cfg = getGeideaConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[geidea:health] config invalid', { requestId, error: msg });
      const safe = e instanceof GeideaConfigError ? `invalid_config:${e.field}` : 'invalid_config';
      return withNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            step: 'config',
            baseUrl: null,
            hppBaseUrl: null,
            sessionOk: false,
            details: { error: safe },
          },
          { status: 500 }
        )
      );
    }

    const out: any = {
      ok: false,
      baseUrl: cfg.baseUrl,
      hppBaseUrl: cfg.hppBaseUrl,
      sessionOk: false,
      step: 'create_session' as 'create_session' | 'done',
      details: {},
    };

    const merchantReferenceId = `health_${crypto.randomUUID()}`;

    try {
      const timestamp = geideaTimestampNow();
      const { sessionId } = await createCheckoutSession({
        requestId,
        merchantReferenceId,
        amount: 1,
        currency: 'EGP',
        paymentOperation: 'Pay',
        callbackUrl: cfg.callbackUrl,
        returnUrl: cfg.returnUrl,
        language: 'en',
        timestamp,
        customer: {
          email: 'healthcheck@egyptgoldpro.com',
          firstName: 'Health',
          lastName: 'Check',
          phoneNumber: '01000000000',
          phoneCountryCode: '+20',
        },
      });

      out.sessionOk = true;
      out.step = 'done';
      out.ok = true;
      out.details = { merchantReferenceId, sessionIdPrefix: sessionId.slice(0, 8) };

      return withNoStoreHeaders(NextResponse.json(out, { status: 200 }));
    } catch (e) {
      out.step = 'create_session';
      out.details = isGeideaHttpError(e)
        ? { status: e.status, url: e.url, responsePreview: e.responsePreview }
        : { error: e instanceof Error ? e.message : String(e) };
      return withNoStoreHeaders(NextResponse.json(out, { status: 502 }));
    }
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
