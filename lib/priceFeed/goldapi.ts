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

export type GoldQuote = {
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number; // epoch ms
  currency: 'USD';
  metal: 'XAU';
  source: 'goldapi';
};

function normalizeBaseUrl(raw: string) {
  const s = raw.trim().replace(/\/+$/, '');
  return s.length ? s : 'https://app.goldapi.net';
}

function toMs(ts: unknown): number | null {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!isFinite(n) || n <= 0) return null;
  // Heuristic: seconds if < 1e12
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
}

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

export async function fetchGoldApiQuote(): Promise<GoldQuote> {
  const baseUrl = normalizeBaseUrl(process.env.GOLDAPI_BASE_URL ?? 'https://app.goldapi.net');
  const apiKey = (process.env.GOLDAPI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('Missing GOLDAPI_API_KEY (server env var)');
  }

  const url = `${baseUrl}/price/XAU/USD`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      const snippet = text.slice(0, 300);
      throw new Error(`GoldAPI error ${res.status}: ${snippet}`);
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GoldAPI invalid JSON: ${text.slice(0, 200)}`);
    }

    const price = asNum(json?.price);
    const tsMs = toMs(json?.timestamp ?? json?.timestamp_ms ?? json?.ts ?? json?.time);
    if (price === null || price <= 0) throw new Error('GoldAPI response missing valid price');
    if (tsMs === null) throw new Error('GoldAPI response missing valid timestamp');

    const bid = asNum(json?.bid);
    const ask = asNum(json?.ask);

    return {
      price,
      bid: bid ?? undefined,
      ask: ask ?? undefined,
      timestamp: tsMs,
      currency: 'USD',
      metal: 'XAU',
      source: 'goldapi',
    };
  } finally {
    clearTimeout(timeout);
  }
}

