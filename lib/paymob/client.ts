import 'server-only';

export type PaymobConfig = {
  apiKey: string;
  baseUrl: string; // e.g. https://accept.paymob.com/api
  integrationIdCard: number;
};

export type PaymobAuthTokenResponse = { token: string };

export type PaymobCreateOrderResponse = {
  id: number;
  merchant_order_id?: string;
  amount_cents?: number;
  currency?: string;
};

export type PaymobPaymentKeyResponse = { token: string };

function getBaseUrl(): string {
  const b = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com/api';
  return b.replace(/\/+$/, '');
}

async function paymobFetch<T>(path: string, body: unknown, requestId: string): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    // never include secrets in logs
    console.error('[paymob] request failed', {
      requestId,
      url,
      status: res.status,
      bodyPreview: typeof body === 'object' ? Object.keys(body as any) : typeof body,
      response: text.slice(0, 500),
    });
    throw new Error(`paymob_http_${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error('[paymob] bad json', { requestId, url, status: res.status, response: text.slice(0, 500) });
    throw new Error('paymob_bad_json');
  }
}

export async function authToken(args: { apiKey: string; requestId: string }): Promise<string> {
  if (!args.apiKey) throw new Error('missing_PAYMOB_API_KEY');
  const out = await paymobFetch<PaymobAuthTokenResponse>('/auth/tokens', { api_key: args.apiKey }, args.requestId);
  if (!out?.token) throw new Error('paymob_missing_auth_token');
  return out.token;
}

export async function createOrder(args: {
  authToken: string;
  merchantOrderId: string;
  amountCents: number;
  currency: 'EGP';
  planLabel: string;
  requestId: string;
}): Promise<PaymobCreateOrderResponse> {
  const body = {
    auth_token: args.authToken,
    delivery_needed: false,
    amount_cents: String(args.amountCents),
    currency: args.currency,
    merchant_order_id: args.merchantOrderId,
    items: [
      {
        name: 'EgyptGold Pro Premium',
        amount_cents: String(args.amountCents),
        description: args.planLabel,
        quantity: 1,
      },
    ],
  };
  const out = await paymobFetch<PaymobCreateOrderResponse>('/ecommerce/orders', body, args.requestId);
  if (!out?.id) throw new Error('paymob_missing_order_id');
  return out;
}

export async function createPaymentKey(args: {
  authToken: string;
  paymobOrderId: number;
  amountCents: number;
  currency: 'EGP';
  billingData: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  integrationIdCard: number;
  requestId: string;
  redirectUrl?: string;
  merchantOrderId?: string;
}): Promise<string> {
  const b = args.billingData;
  const body: any = {
    auth_token: args.authToken,
    amount_cents: String(args.amountCents),
    expiration: 3600,
    order_id: args.paymobOrderId,
    billing_data: {
      apartment: 'NA',
      email: b.email,
      floor: 'NA',
      first_name: b.firstName,
      street: 'NA',
      building: 'NA',
      phone_number: b.phone,
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'NA',
      country: 'EG',
      last_name: b.lastName,
      state: 'NA',
    },
    currency: args.currency,
    integration_id: args.integrationIdCard,
    lock_order_when_paid: true,
  };

  // Paymob supports passing redirect_url for redirect-based flows; harmless if ignored.
  if (args.redirectUrl) body.redirect_url = args.redirectUrl;
  // Some Paymob setups accept extra_data/merchant_order_id; best-effort for traceability.
  if (args.merchantOrderId) body.merchant_order_id = args.merchantOrderId;

  const out = await paymobFetch<PaymobPaymentKeyResponse>('/acceptance/payment_keys', body, args.requestId);
  if (!out?.token) throw new Error('paymob_missing_payment_key');

  // NEVER log the payment key (even masked) in production logs.
  return out.token;
}

export function buildHostedPaymentUrl(args: { paymentKey: string }): string {
  return `https://accept.paymob.com/api/acceptance/payments/pay?payment_token=${encodeURIComponent(args.paymentKey)}`;
}

