'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useLang } from '@/components/LanguageProvider';

type SpotResp =
  | { ok: true; price_usd_per_oz: number; fetched_at_ms: number; ageSeconds: number; stale_data: boolean; source: string; serverAsOf: string }
  | { ok: false; error: string; serverAsOf?: string };

type LocalResp =
  | {
      ok: true;
      country: 'EG' | 'AE' | 'SA' | 'US';
      karat: number;
      unit: 'per_gram';
      price: number;
      currency: string;
      created_at: string;
      source: string;
      serverAsOf: string;
    }
  | { ok: false; error: string };

function fmtLocal(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
}

function clampNum(x: string): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function GoldConverter(props: {
  country: 'EG' | 'AE' | 'SA' | 'US';
  defaultKarat?: 24 | 21 | 18 | 14 | 22;
  availableKarats?: Array<24 | 21 | 18 | 14 | 22>;
}) {
  const { lang } = useLang();
  const [spot, setSpot] = useState<SpotResp | null>(null);
  const [local, setLocal] = useState<LocalResp | null>(null);
  const [karat, setKarat] = useState<number>(props.defaultKarat ?? 24);
  const [oz, setOz] = useState<string>('1');
  const [grams, setGrams] = useState<string>('10');

  const karats = useMemo(() => {
    const base = props.availableKarats && props.availableKarats.length > 0 ? props.availableKarats : ([24, 21, 18, 14] as const);
    // Ensure uniqueness and stable order
    return Array.from(new Set(base)).sort((a, b) => b - a);
  }, [props.availableKarats]);

  useEffect(() => {
    let cancelled = false;
    const loadSpot = async () => {
      const res = await fetch('/api/market/spot/xauusd', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as SpotResp | null;
      if (cancelled) return;
      if (!json) return setSpot({ ok: false, error: 'spot_unavailable' });
      setSpot(json);
    };
    void loadSpot();
    const t = setInterval(() => void loadSpot(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLocal = async () => {
      const res = await fetch(`/api/market/local-latest?country=${encodeURIComponent(props.country)}&karat=${encodeURIComponent(String(karat))}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as LocalResp | null;
      if (cancelled) return;
      if (!json) return setLocal({ ok: false, error: 'local_unavailable' });
      setLocal(json);
    };
    void loadLocal();
    const t = setInterval(() => void loadLocal(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [props.country, karat]);

  const ozN = clampNum(oz);
  const gramsN = clampNum(grams);
  const usdValue = spot && spot.ok && typeof spot.price_usd_per_oz === 'number' ? ozN * spot.price_usd_per_oz : null;
  const localValue = local && local.ok && typeof local.price === 'number' ? gramsN * local.price : null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-gray-100">{lang === 'ar' ? 'محول ذهب-إلى-ذهب' : 'Gold-to-Gold Converter'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {lang === 'ar'
              ? 'تحويل إرشادي بين الأونصة العالمية والسعر المحلي (بالجرام).'
              : 'Indicative conversion between global ounce and local per-gram prices.'}
          </div>
        </div>
        <div className="text-xs text-gray-300">
          <label className="mr-2">{lang === 'ar' ? 'عيار' : 'Karat'}</label>
          <select
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
            value={karat}
            onChange={(e) => setKarat(Number(e.target.value))}
          >
            {karats.map((k) => (
              <option key={k} value={k}>
                {k}K
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-gray-800 bg-gray-900/30 p-3">
          <div className="text-xs text-gray-400">{lang === 'ar' ? 'العالمي (XAU/USD)' : 'Global (XAU/USD)'}</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
              value={oz}
              onChange={(e) => setOz(e.target.value)}
              inputMode="decimal"
            />
            <span className="text-sm text-gray-300">{lang === 'ar' ? 'أونصة' : 'oz'}</span>
            <span className="text-sm text-gray-500">→</span>
            <span className="text-sm text-gray-100 font-mono">{usdValue !== null ? `$${usdValue.toFixed(2)}` : '—'}</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {spot && spot.ok ? (
              <>
                {lang === 'ar' ? 'سعر الأونصة:' : 'Ounce price:'} <span className="font-mono">${spot.price_usd_per_oz.toFixed(2)}</span>
                {' · '}
                {lang === 'ar' ? 'وقت:' : 'As-of:'} {fmtLocal(spot.fetched_at_ms)}
              </>
            ) : (
              <span className="text-red-300">{lang === 'ar' ? 'غير متاح' : 'Unavailable'}</span>
            )}
          </div>
        </div>

        <div className="rounded-md border border-gray-800 bg-gray-900/30 p-3">
          <div className="text-xs text-gray-400">{lang === 'ar' ? 'المحلي (بالجرام)' : 'Local (per gram)'}</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              inputMode="decimal"
            />
            <span className="text-sm text-gray-300">{lang === 'ar' ? 'جرام' : 'g'}</span>
            <span className="text-sm text-gray-500">→</span>
            <span className="text-sm text-gray-100 font-mono">
              {localValue !== null && local && local.ok ? `${localValue.toFixed(2)} ${local.currency}` : '—'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {local && local.ok ? (
              <>
                {lang === 'ar' ? 'سعر/جرام:' : 'Per gram:'} <span className="font-mono">{local.price.toFixed(2)}</span> {local.currency}
                {' · '}
                {lang === 'ar' ? 'وقت:' : 'As-of:'} {fmtLocal(local.created_at)}
              </>
            ) : (
              <span className="text-red-300">{lang === 'ar' ? 'غير متاح' : 'Unavailable'}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">
        {lang === 'ar'
          ? 'تنبيه: المحول إرشادي فقط. فروقات السعر والرسوم تختلف حسب السوق.'
          : 'Note: Converter is indicative only. Spreads/fees vary by market.'}
      </div>
    </div>
  );
}

