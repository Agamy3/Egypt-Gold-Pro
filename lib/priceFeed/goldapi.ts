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
    // IMPORTANT: https://www.goldapi.io/XAU/USD returns an HTML website page (not JSON).
    // Prefer /api/XAU/USD for goldapi.io.
    let host = '';
    try {
      host = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      host = '';
    }

    const baseHasApi = /\/api$/i.test(baseUrl);
    const isGoldApiIo = host.includes('goldapi.io');

    const candidates = isGoldApiIo
      ? [
          // Most common for goldapi.io
          joinUrl(baseUrl, '/api/XAU/USD'),
          // Some accounts/docs use this
          joinUrl(baseUrl, '/price/XAU/USD'),
        ]
      : [
          // Docs example for goldapi.net/app.goldapi.net
          joinUrl(baseUrl, '/price/XAU/USD'),
          ...(baseHasApi ? [joinUrl(baseUrl, '/XAU/USD')] : [joinUrl(baseUrl, '/api/XAU/USD')]),
          // Last-resort; may be HTML on some hosts
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

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const bodyStartsHtml = /^\s*<(?:!doctype|html|head|script)\b/i.test(text);
      if (contentType.includes('text/html') || bodyStartsHtml) {
        // This is almost certainly the marketing website or an HTML error page.
        lastErr = `GoldAPI returned HTML (not JSON) @ ${url}. Check GOLDAPI_BASE_URL and GOLDAPI_API_KEY.`;
        continue;
      }

      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        lastErr = `GoldAPI invalid JSON @ ${url}: ${text.slice(0, 200)}`;
        continue;
      }

      const j = json as Record<string, unknown>;
      const price = asFiniteNumber(j.price);
      const tsMs =
        normalizeTimestampMs(j.timestamp ?? j.timestamp_ms ?? j.ts ?? j.time ?? j.updatedAt) ??
        null;
      if (price === null || price <= 0) {
        lastErr = `GoldAPI response missing valid price @ ${url}`;
        continue;
      }
      if (tsMs === null) {
        lastErr = `GoldAPI response missing valid timestamp @ ${url}`;
        continue;
      }

      const bid = asFiniteNumber(j.bid);
      const ask = asFiniteNumber(j.ask);

      return {
        price,
        bid: bid ?? undefined,
        ask: ask ?? undefined,
        timestampMs: tsMs,
        provider: 'goldapi',
        missingTimestamp: false,
        raw: json,
      };
    }

    throw new Error(
      lastErr ??
        `GoldAPI request failed. Ensure GOLDAPI_BASE_URL is the API host (e.g. https://app.goldapi.net or https://www.goldapi.io) and GOLDAPI_API_KEY is set.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

