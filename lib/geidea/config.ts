import 'server-only';

export type GeideaRuntimeConfig = {
  baseUrl: string;
  publicKey: string;
  apiPassword: string;
  callbackUrl: string;
  returnUrl: string;
  hppBaseUrl: string;
};

export class GeideaConfigError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

let _cachedConfig: GeideaRuntimeConfig | null = null;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function requireNonEmpty(name: string, v: string | undefined): string {
  const s = String(v || '').trim();
  if (!s) throw new GeideaConfigError(name, `missing_${name}`);
  return s;
}

function requireAbsoluteUrl(name: string, v: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new GeideaConfigError(name, `invalid_${name}_url`);
  }
  if (!u.protocol || (u.protocol !== 'https:' && u.protocol !== 'http:')) {
    throw new GeideaConfigError(name, `invalid_${name}_protocol`);
  }
  return stripTrailingSlash(u.toString());
}

function deriveHppBaseUrl(baseUrl: string): string {
  // Geidea docs show a hosted checkout on a non-API domain (e.g. www.ksamerchant.geidea.net/hpp/checkout/)
  // For Egypt base URL api.merchant.geidea.net, derive www.merchant.geidea.net.
  try {
    const u = new URL(baseUrl);
    const host = u.host;
    const hppHost = host.startsWith('api.') ? `www.${host.slice(4)}` : `www.${host}`;
    return `${u.protocol}//${hppHost}`;
  } catch {
    // Should never happen since baseUrl is validated.
    return 'https://www.merchant.geidea.net';
  }
}

export function getGeideaConfig(): GeideaRuntimeConfig {
  if (_cachedConfig) return _cachedConfig;

  const baseUrl = requireAbsoluteUrl('GEIDEA_BASE_URL', requireNonEmpty('GEIDEA_BASE_URL', process.env.GEIDEA_BASE_URL));
  const publicKey = requireNonEmpty('GEIDEA_PUBLIC_KEY', process.env.GEIDEA_PUBLIC_KEY);
  const apiPassword = requireNonEmpty('GEIDEA_API_PASSWORD', process.env.GEIDEA_API_PASSWORD);

  const callbackUrl = requireAbsoluteUrl(
    'GEIDEA_CALLBACK_URL',
    requireNonEmpty('GEIDEA_CALLBACK_URL', process.env.GEIDEA_CALLBACK_URL)
  );
  const returnUrl = requireAbsoluteUrl('GEIDEA_RETURN_URL', requireNonEmpty('GEIDEA_RETURN_URL', process.env.GEIDEA_RETURN_URL));

  const hppBaseUrl = requireAbsoluteUrl(
    'GEIDEA_HPP_BASE_URL',
    String(process.env.GEIDEA_HPP_BASE_URL || deriveHppBaseUrl(baseUrl)).trim()
  );

  _cachedConfig = {
    baseUrl,
    publicKey,
    apiPassword,
    callbackUrl,
    returnUrl,
    hppBaseUrl,
  };

  return _cachedConfig;
}
