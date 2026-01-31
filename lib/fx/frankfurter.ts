import 'server-only';

type CacheEntry = { rate: number; date: string; expiresAtMs: number };
const cache = new Map<string, CacheEntry>();

export async function fetchUsdTo(currency: string): Promise<
  | { ok: true; rate: number; date: string; source: 'frankfurter' }
  | { ok: false; error: string }
> {
  const cur = String(currency || '').trim().toUpperCase();
  if (!cur) return { ok: false, error: 'Missing currency' };
  if (cur === 'USD') return { ok: true, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'frankfurter' };

  const now = Date.now();
  const cached = cache.get(cur);
  if (cached && cached.expiresAtMs > now) {
    return { ok: true, rate: cached.rate, date: cached.date, source: 'frankfurter' };
  }

  try {
    const url = `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(cur)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) return { ok: false, error: `frankfurter ${res.status}: ${JSON.stringify(json || {})}` };

    const rate = typeof json?.rates?.[cur] === 'number' ? json.rates[cur] : Number(json?.rates?.[cur]);
    if (!isFinite(rate) || rate <= 0) return { ok: false, error: `Invalid FX rate for USD/${cur}` };
    const date = typeof json?.date === 'string' ? json.date : new Date().toISOString().slice(0, 10);

    cache.set(cur, { rate, date, expiresAtMs: now + 10 * 60 * 1000 });
    return { ok: true, rate, date, source: 'frankfurter' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetchUsdTo failed' };
  }
}

