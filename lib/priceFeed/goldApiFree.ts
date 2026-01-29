/**
 * Free (no-key) provider: api.gold-api.com
 *
 * Env (server-only):
 * - GOLD_API_FREE_BASE_URL (default: https://api.gold-api.com)
 */

import 'server-only';

import type { Quote } from './types';
import { asFiniteNumber, normalizeTimestampMs } from './normalize';

function normalizeBaseUrl(raw: string) {
  const s = raw.trim().replace(/\/+$/, '');
  return s.length ? s : 'https://api.gold-api.com';
}

function joinUrl(base: string, path: string) {
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path}`;
}

export async function fetchGoldApiFreeQuote(): Promise<Quote> {
  const baseUrl = normalizeBaseUrl(process.env.GOLD_API_FREE_BASE_URL ?? 'https://api.gold-api.com');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const candidates = [
      joinUrl(baseUrl, '/price/XAU'),
      joinUrl(baseUrl, '/price?symbol=XAU'),
      joinUrl(baseUrl, '/latest/XAU'),
    ];

    let lastErr: string | null = null;

    for (const url of candidates) {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        lastErr = `gold-api.com error ${res.status} @ ${url}: ${text.slice(0, 200)}`;
        continue;
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastErr = `gold-api.com invalid JSON @ ${url}: ${text.slice(0, 200)}`;
        continue;
      }

      // Accept several known shapes.
      const price =
        asFiniteNumber(json?.price) ??
        asFiniteNumber(json?.value) ??
        asFiniteNumber(json?.data?.price) ??
        asFiniteNumber(json?.data?.value);

      if (price == null || price <= 0) {
        lastErr = `gold-api.com response missing valid price @ ${url}`;
        continue;
      }

      const ts =
        normalizeTimestampMs(json?.timestamp) ??
        normalizeTimestampMs(json?.timestampMs) ??
        normalizeTimestampMs(json?.updatedAt) ??
        normalizeTimestampMs(json?.time) ??
        normalizeTimestampMs(json?.data?.timestamp) ??
        normalizeTimestampMs(json?.data?.updatedAt);

      const missingTimestamp = ts == null;
      const timestampMs = ts ?? Date.now();

      return {
        price,
        timestampMs,
        provider: 'gold_api_free',
        raw: { ...json, missingTimestamp },
      };
    }

    throw new Error(lastErr ?? 'gold-api.com request failed');
  } finally {
    clearTimeout(timeout);
  }
}

