import 'server-only';

export type PaymobRuntimeConfig = {
  apiKey: string;
  hmacSecret: string;
  baseUrl: string;
  integrationIdCard: number;
  appUrl: string;
};

export class PaymobConfigError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

let _cachedConfig: PaymobRuntimeConfig | null = null;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function requireNonEmpty(name: string, v: string | undefined): string {
  const s = String(v || '').trim();
  if (!s) throw new PaymobConfigError(name, `missing_${name}`);
  return s;
}

function requireAbsoluteUrl(name: string, v: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new PaymobConfigError(name, `invalid_${name}_url`);
  }
  if (!u.protocol || (u.protocol !== 'https:' && u.protocol !== 'http:')) {
    throw new PaymobConfigError(name, `invalid_${name}_protocol`);
  }
  return stripTrailingSlash(u.toString());
}

function requirePositiveInt(name: string, v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new PaymobConfigError(name, `invalid_${name}`);
  }
  return n;
}

export function getPaymobConfig(): PaymobRuntimeConfig {
  if (_cachedConfig) return _cachedConfig;

  const apiKey = requireNonEmpty('PAYMOB_API_KEY', process.env.PAYMOB_API_KEY);
  const hmacSecret = requireNonEmpty('PAYMOB_HMAC_SECRET', process.env.PAYMOB_HMAC_SECRET);

  const baseUrlRaw = String(process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com/api').trim();
  const baseUrl = requireAbsoluteUrl('PAYMOB_BASE_URL', baseUrlRaw);

  const integrationIdCard = requirePositiveInt(
    'PAYMOB_INTEGRATION_ID_CARD',
    requireNonEmpty('PAYMOB_INTEGRATION_ID_CARD', process.env.PAYMOB_INTEGRATION_ID_CARD)
  );

  const appUrlRaw = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  const appUrl = requireAbsoluteUrl('NEXT_PUBLIC_APP_URL', requireNonEmpty('NEXT_PUBLIC_APP_URL', appUrlRaw));

  _cachedConfig = {
    apiKey,
    hmacSecret,
    baseUrl,
    integrationIdCard,
    appUrl,
  };

  return _cachedConfig;
}
