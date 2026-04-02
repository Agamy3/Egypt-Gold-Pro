import 'server-only';

import { getGeideaConfig } from '@/lib/geidea/config';
import { buildGeideaCreateSessionSignature } from '@/lib/geidea/signature';

export type GeideaCreateSessionResponse = {
  responseCode?: string;
  detailedResponseCode?: string;
  responseMessage?: string;
  detailedResponseMessage?: string;
  session?: { id?: string };
  order?: { orderId?: string; merchantReferenceId?: string; status?: string };
  signature?: string;
  timestamp?: string;
  amount?: string | number;
  currency?: string;
  merchantReferenceId?: string;
};

export class GeideaHttpError extends Error {
  status: number;
  url: string;
  responsePreview: string;
  constructor(args: { status: number; url: string; responsePreview: string }) {
    super(`geidea_http_${args.status}`);
    this.status = args.status;
    this.url = args.url;
    this.responsePreview = args.responsePreview;
  }
}

export function isGeideaHttpError(e: unknown): e is GeideaHttpError {
  return e instanceof GeideaHttpError;
}

function basicAuthHeader(publicKey: string, apiPassword: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${apiPassword}`, 'utf8').toString('base64')}`;
}

async function geideaFetch<T>(path: string, body: unknown, requestId: string): Promise<T> {
  const cfg = getGeideaConfig();
  const url = `${cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const timeoutMs = 15_000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(cfg.publicKey, cfg.apiPassword),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: ac.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[geidea] request failed', { requestId, url, error: msg });
    throw new Error('geidea_network_error');
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error('[geidea] request failed', {
      requestId,
      url,
      status: res.status,
      bodyPreview: typeof body === 'object' && body !== null ? Object.keys(body as Record<string, unknown>) : typeof body,
      response: text.slice(0, 500),
    });
    throw new GeideaHttpError({ status: res.status, url, responsePreview: text.slice(0, 500) });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error('[geidea] bad json', { requestId, url, status: res.status, response: text.slice(0, 500) });
    throw new Error('geidea_bad_json');
  }
}

export async function createCheckoutSession(args: {
  requestId: string;
  merchantReferenceId: string;
  amount: number;
  currency: 'EGP';
  paymentOperation: 'Pay';
  callbackUrl: string;
  returnUrl: string;
  language?: 'en' | 'ar';
  customer?: {
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    phoneCountryCode?: string;
  };
  order?: {
    items?: Array<{
      merchantItemId: string;
      name: string;
      description?: string;
      categories?: string;
      count: number;
      price: number;
      sku?: string;
    }>;
  };
  timestamp: string;
}): Promise<{ sessionId: string; raw: GeideaCreateSessionResponse }> {
  const cfg = getGeideaConfig();

  const signature = buildGeideaCreateSessionSignature({
    publicKey: cfg.publicKey,
    apiPassword: cfg.apiPassword,
    amount: args.amount,
    currency: args.currency,
    merchantReferenceId: args.merchantReferenceId,
    timestamp: args.timestamp,
  });

  const body: Record<string, unknown> = {
    amount: String(args.amount),
    currency: args.currency,
    timestamp: args.timestamp,
    merchantReferenceId: args.merchantReferenceId,
    signature,
    paymentOperation: args.paymentOperation,
    language: args.language ?? 'en',
    callbackUrl: args.callbackUrl,
    returnUrl: args.returnUrl,
  };

  if (args.customer) {
    body.customer = {
      email: args.customer.email,
      phoneNumber: args.customer.phoneNumber,
      phonecountrycode: args.customer.phoneCountryCode ?? '+20',
      firstName: args.customer.firstName,
      lastName: args.customer.lastName,
    };
  }

  if (args.order) {
    body.order = args.order;
  }

  // Docs sample: /payment-intent/api/v2/direct/session
  const out = await geideaFetch<GeideaCreateSessionResponse>('/payment-intent/api/v2/direct/session', body, args.requestId);

  const sessionId = String(out?.session?.id || '').trim();
  if (!sessionId) {
    console.error('[geidea] missing session id', {
      requestId: args.requestId,
      responseCode: out?.responseCode,
      detailedResponseCode: out?.detailedResponseCode,
    });
    throw new Error('geidea_missing_session_id');
  }

  // Treat responseCode/detailedResponseCode not-000 as an error even if HTTP 200.
  if ((out.responseCode && out.responseCode !== '000') || (out.detailedResponseCode && out.detailedResponseCode !== '000')) {
    console.error('[geidea] create session rejected', {
      requestId: args.requestId,
      responseCode: out?.responseCode,
      detailedResponseCode: out?.detailedResponseCode,
      detailedResponseMessage: out?.detailedResponseMessage,
    });
    throw new Error('geidea_create_session_rejected');
  }

  return { sessionId, raw: out };
}

export function buildHostedCheckoutUrl(args: { hppBaseUrl: string; sessionId: string }): string {
  // Docs show /hpp/checkout/?{sessionId}
  const base = args.hppBaseUrl.replace(/\/+$/, '');
  return `${base}/hpp/checkout/?${encodeURIComponent(args.sessionId)}`;
}
