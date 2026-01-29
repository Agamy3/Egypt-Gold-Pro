/**
 * GoldAPI spot quote fetcher (server-only).
 *
 * Env (server-only):
 * - GOLDAPI_BASE_URL (default: https://app.goldapi.net)
 * - GOLDAPI_API_KEY (required)
 *
 * Fetches: GET {baseUrl}/price/XAU/USD with header x-api-key
 */

import 'server-only';

import type { Quote } from './types';
import { asFiniteNumber, normalizeTimestampMs } from './normalize';

function normalizeBaseUrl(raw: string) {
  const s = raw.trim().replace(/\/+$/, '');
  return s.length ? s : 'https://app.goldapi.net';
}

function joinUrl(base: string, path: string) {
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path}`;
}

export async function fetchGoldApiQuote(): Promise<Quote> {
  const baseUrl = normalizeBaseUrl(process.env.GOLDAPI_BASE_URL ?? 'https://app.goldapi.net');
  const apiKey = (process.env.GOLDAPI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('Missing GOLDAPI_API_KEY (server env var)');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    // Different GoldAPI deployments use different paths.
    // Try a small set of known patterns:
    // - https://app.goldapi.net/price/XAU/USD (docs example)
    // - https://www.goldapi.io/api/XAU/USD (common)
    // - https://<base>/api/XAU/USD (some accounts)
    const baseHasApi = /\/api$/i.test(baseUrl);
    const candidates = [
      joinUrl(baseUrl, '/price/XAU/USD'),
      ...(baseHasApi ? [joinUrl(baseUrl, '/XAU/USD')] : [joinUrl(baseUrl, '/api/XAU/USD')]),
      joinUrl(baseUrl, '/XAU/USD'),
    ];

    let lastErr: string | null = null;

    for (const url of candidates) {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // Support both header styles; different GoldAPI products use different names.
          'x-api-key': apiKey,
          'x-access-token': apiKey,
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        const snippet = text.slice(0, 250);
        lastErr = `GoldAPI error ${res.status} @ ${url}: ${snippet}`;
        // Try next candidate
        continue;
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastErr = `GoldAPI invalid JSON @ ${url}: ${text.slice(0, 200)}`;
        continue;
      }

      const price = asFiniteNumber(json?.price);
      const tsMs =
        normalizeTimestampMs(json?.timestamp ?? json?.timestamp_ms ?? json?.ts ?? json?.time ?? json?.updatedAt) ??
        null;
      if (price === null || price <= 0) {
        lastErr = `GoldAPI response missing valid price @ ${url}`;
        continue;
      }
      if (tsMs === null) {
        lastErr = `GoldAPI response missing valid timestamp @ ${url}`;
        continue;
      }

      const bid = asFiniteNumber(json?.bid);
      const ask = asFiniteNumber(json?.ask);

      return {
        price,
        bid: bid ?? undefined,
        ask: ask ?? undefined,
        timestampMs: tsMs,
        provider: 'goldapi',
        raw: json,
      };
    }

    throw new Error(lastErr ?? 'GoldAPI request failed');
  } finally {
    clearTimeout(timeout);
  }
}

