const DEFAULT_CANONICAL_SITE_URL = 'https://egyptgoldpro.com';

function normalizeSiteUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const url = new URL(trimmed);

  // Always prefer https for production canonicalization.
  if (url.protocol !== 'https:') url.protocol = 'https:';

  // Normalize away www to avoid cookie/PKCE splitting.
  if (url.hostname.startsWith('www.')) url.hostname = url.hostname.slice(4);

  return url;
}

export function getCanonicalSiteUrl(): URL {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim() !== '') return normalizeSiteUrl(envUrl);
  return normalizeSiteUrl(DEFAULT_CANONICAL_SITE_URL);
}

export function getCanonicalOrigin(): string {
  return getCanonicalSiteUrl().origin;
}

export function canonicalizeHost(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

