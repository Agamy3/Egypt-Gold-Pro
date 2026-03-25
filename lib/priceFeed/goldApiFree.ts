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

      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        lastErr = `gold-api.com invalid JSON @ ${url}: ${text.slice(0, 200)}`;
        continue;
      }

      // Accept several known shapes.
      const j = json as Record<string, unknown>;
      const data = j.data as Record<string, unknown> | undefined;
      const price =
        asFiniteNumber(j.price) ??
        asFiniteNumber(j.value) ??
        asFiniteNumber(data?.price) ??
        asFiniteNumber(data?.value);

      if (price == null || price <= 0) {
        lastErr = `gold-api.com response missing valid price @ ${url}`;
        continue;
      }

      const ts =
        normalizeTimestampMs(j.timestamp) ??
        normalizeTimestampMs(j.timestampMs) ??
        normalizeTimestampMs(j.updatedAt) ??
        normalizeTimestampMs(j.time) ??
        normalizeTimestampMs(data?.timestamp) ??
        normalizeTimestampMs(data?.updatedAt);

      const missingTimestamp = ts == null;
      const timestampMs = ts ?? Date.now();

      return {
        price,
        timestampMs,
        provider: 'gold_api_free',
        missingTimestamp,
        raw: { ...(j as Record<string, unknown>), missingTimestamp },
      };
    }

    throw new Error(lastErr ?? 'gold-api.com request failed');
  } finally {
    clearTimeout(timeout);
  }
}

