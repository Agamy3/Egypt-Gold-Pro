import 'server-only';

export async function fetchXagUsd(): Promise<
  | { ok: true; priceUsdPerOunce: number; tsIso: string; source: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAG', {
      cache: 'no-store',
      headers: { 'User-Agent': 'egyptgold-pro/1.0 (+vercel)' },
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return { ok: false, error: `gold-api.com ${res.status}: ${JSON.stringify(json || {})}` };
    }

    const raw = json?.price ?? json?.value ?? json?.data?.price ?? null;
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Invalid XAG price from provider' };

    const tsIso =
      typeof json?.timestamp === 'string'
        ? json.timestamp
        : typeof json?.time === 'string'
          ? json.time
          : new Date().toISOString();

    return { ok: true, priceUsdPerOunce: n, tsIso, source: 'gold-api.com' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetchXagUsd failed' };
  }
}

// Back-compat alias (used by older code paths)
export const fetchSpotXagUsd = fetchXagUsd;

