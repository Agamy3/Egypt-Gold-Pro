import 'server-only';

import { getMultiCurrencyRates } from '@/lib/fx-multi';

type CacheEntry = { rate: number; date: string; source: string; expiresAtMs: number };
const cache = new Map<string, CacheEntry>();

export async function fetchUsdTo(currency: string): Promise<
  | { ok: true; rate: number; date: string; source: 'frankfurter' | 'open.er-api.com' }
  | { ok: false; error: string }
> {
  const cur = String(currency || '').trim().toUpperCase();
  if (!cur) return { ok: false, error: 'Missing currency' };
  if (cur === 'USD') return { ok: true, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'frankfurter' };

  const now = Date.now();
  const cached = cache.get(cur);
  if (cached && cached.expiresAtMs > now) {
    return { ok: true, rate: cached.rate, date: cached.date, source: cached.source as any };
  }

  // Frankfurter (ECB-based) often does not include EGP/AED/SAR.
  // For our supported countries, use the existing open.er-api.com provider as a reliable fallback.
  if (cur === 'EGP' || cur === 'AED' || cur === 'SAR') {
    const fx = await getMultiCurrencyRates();
    const rate =
      cur === 'EGP' ? fx.usd_egp :
      cur === 'AED' ? fx.usd_aed :
      fx.usd_sar;
    if (!rate || !isFinite(rate) || rate <= 0) return { ok: false, error: `Invalid FX rate for USD/${cur}` };
    const date = new Date(fx.fetchedAt).toISOString().slice(0, 10);
    cache.set(cur, { rate, date, source: 'open.er-api.com', expiresAtMs: now + 10 * 60 * 1000 });
    return { ok: true, rate, date, source: 'open.er-api.com' };
  }

  try {
    const url = `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(cur)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) return { ok: false, error: `frankfurter ${res.status}: ${JSON.stringify(json || {})}` };

    const rate = typeof json?.rates?.[cur] === 'number' ? json.rates[cur] : Number(json?.rates?.[cur]);
    if (!isFinite(rate) || rate <= 0) return { ok: false, error: `Invalid FX rate for USD/${cur}` };
    const date = typeof json?.date === 'string' ? json.date : new Date().toISOString().slice(0, 10);

    cache.set(cur, { rate, date, source: 'frankfurter', expiresAtMs: now + 10 * 60 * 1000 });
    return { ok: true, rate, date, source: 'frankfurter' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetchUsdTo failed' };
  }
}

