'use client';

import { startVisiblePolling } from '@/lib/client/visible-polling.mjs';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ShareSignalButton, { SignalTrustBadges } from '@/components/ShareSignalButton';
import { PREMIUM_PRICING_RECOMMENDED } from '@/lib/premium/pricing';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Direction = 'UP' | 'DOWN' | 'STALE';
type Confidence = 'low' | 'med' | 'high';
type Karat = 999 | 925 | 900 | 800;

type SilverSnapshot = {
  ok: boolean;
  error?: string;
  country: Country;
  currency: string;
  price_per_oz: number | null;
  price_per_g: number | null;
  direction: Direction;
  confidence: Confidence;
  lastUpdatedAt: string | null;
};

type LocalSilverRow = {
  karat: Karat;
  buy_price: number | null;
  sell_price: number | null;
  change_value: number | null;
  change_pct: number | null;
  lastUpdatedAt: string | null;
  stale: boolean;
  confidence: Confidence;
};

function labelConfidence(lang: 'en' | 'ar', c: Confidence) {
  if (lang === 'ar') {
    if (c === 'high') return 'عالية';
    if (c === 'med') return 'متوسطة';
    return 'منخفضة';
  }
  if (c === 'high') return 'High';
  if (c === 'med') return 'Med';
  return 'Low';
}

export default function SilverCard(props: { isPremium: boolean; lang: 'en' | 'ar'; country: Country }) {
  const { isPremium, lang, country } = props;
  const [data, setData] = useState<SilverSnapshot | null>(null);
  const [localRows, setLocalRows] = useState<LocalSilverRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState<'g' | 'oz'>('g');
  const [mode, setMode] = useState<'local' | 'global'>(country === 'EG' ? 'local' : 'global');
  const [karat, setKarat] = useState<Karat>(999);

  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    const run = async (signal: AbortSignal) => {
      try {
        setLoading(true);
        if (mode === 'local') {
          const res = await fetch(`/api/silver/local?country=${country}`, { cache: 'no-store', signal });
          const json = (await res.json().catch(() => null)) as any;
          if (cancelled || signal.aborted) return;
          if (!res.ok || !json?.ok) {
            setLocalRows([]);
            return;
          }
          setLocalRows((json.rows ?? []) as LocalSilverRow[]);
          setData(null);
        } else {
          const res = await fetch(`/api/silverSnapshot?country=${country}`, { cache: 'no-store', signal });
          const json = (await res.json().catch(() => null)) as any;
          if (cancelled || signal.aborted) return;
          if (!res.ok || !json?.ok) {
            setData({ ok: false, error: json?.error || 'Failed to load', country, currency: '—', price_per_g: null, price_per_oz: null, direction: 'STALE', confidence: 'low', lastUpdatedAt: null });
            return;
          }
          setData(json as SilverSnapshot);
          setLocalRows(null);
        }
      } finally {
        if (!cancelled && !signal.aborted) setLoading(false);
      }
    };
    const stop = startVisiblePolling(run, 30_000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [isPremium, country, mode]);

  const price = useMemo(() => {
    if (!data?.ok) return null;
    return unit === 'g' ? data.price_per_g : data.price_per_oz;
  }, [data, unit]);

  const priceLabel = unit === 'g' ? (lang === 'ar' ? 'لكل جرام' : 'per gram') : (lang === 'ar' ? 'لكل أونصة' : 'per oz');

  const directionColor =
    data?.direction === 'UP'
      ? 'border-emerald-700 text-emerald-200 bg-emerald-900/20'
      : data?.direction === 'DOWN'
        ? 'border-red-700 text-red-200 bg-red-900/20'
        : 'border-gray-700 text-gray-200 bg-gray-900/40';

  // NOTE: These hooks must run regardless of premium status to avoid hooks-order mismatches
  // when premium status flips after a client fetch.
  const selectedLocal = useMemo(() => {
    if (!localRows || localRows.length === 0) return null;
    return localRows.find((r) => r.karat === karat) ?? localRows[0] ?? null;
  }, [localRows, karat]);

  const localCurrencyLabel = country === 'EG' ? 'EGP' : (data?.currency ?? '—');

  const localDirection: Direction = useMemo(() => {
    if (!selectedLocal || selectedLocal.stale) return 'STALE';
    const pct = selectedLocal.change_pct;
    if (typeof pct !== 'number' || !isFinite(pct)) return 'STALE';
    if (pct > 0) return 'UP';
    if (pct < 0) return 'DOWN';
    return 'STALE';
  }, [selectedLocal]);

  if (!isPremium) {
    const monthly = `${PREMIUM_PRICING_RECOMMENDED.monthly.egp} EGP / ${lang === 'ar' ? 'شهر' : 'month'} (${PREMIUM_PRICING_RECOMMENDED.monthly.usd} USD)`;
    const yearly = `${PREMIUM_PRICING_RECOMMENDED.yearly.egp} EGP / ${lang === 'ar' ? 'سنة' : 'year'} (${PREMIUM_PRICING_RECOMMENDED.yearly.usd} USD)`;
    return (
      <div className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-700 relative overflow-hidden`}>
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
          }}
        />
        <div className="relative space-y-3">
          <div className={`flex items-center justify-between ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <h2 className={`text-lg font-semibold text-gray-300 inline-flex items-center gap-2 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              {lang === 'ar' ? 'الفضة (XAG) — مميز' : 'Silver (XAG) — Premium'}
            </h2>
          </div>

          <div className={`rounded-md border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200 ${lang === 'ar' ? 'text-right' : ''}`}>
            <div className="font-semibold">{lang === 'ar' ? 'الفضة أكثر تقلبًا' : 'Silver is more volatile'}</div>
            <div className="text-amber-200/90 text-xs mt-1">
              {lang === 'ar'
                ? 'الفضة تتحرك أسرع من الذهب وقد تغيّر اتجاهها بسرعة. اعتبرها إشارة وليست ضمانًا.'
                : 'Silver moves faster than gold and can change direction quickly. Use it as a signal, not certainty.'}
            </div>
          </div>

          <div className={`text-xs text-gray-500 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar'
              ? 'مُشتق من السعر العالمي للفضة (XAG) + سعر الصرف'
              : 'Derived from global silver spot (XAG) + FX rate'}
          </div>

          <div className={`${lang === 'ar' ? 'text-right' : ''}`}>
            <div className="text-gray-200 font-semibold">{lang === 'ar' ? 'افتح إشارات الفضة' : 'Unlock Silver Signals'}</div>
            <ul className="mt-2 text-sm text-gray-400 space-y-1">
              <li>{lang === 'ar' ? '• سعر الفضة المباشر بعملتك' : '• Live Silver (XAG) price in your currency'}</li>
              <li>{lang === 'ar' ? '• اتجاه: طالع / نازل / ثابت' : '• UP / DOWN / STALE direction'}</li>
              <li>{lang === 'ar' ? '• تنبيهات عند حركة الفضة' : '• Smart alerts when silver moves'}</li>
              <li>{lang === 'ar' ? '• أصل عالي التقلب (مُوضح بوضوح)' : '• Higher-volatility asset (clearly labeled)'}</li>
            </ul>
            <div className="mt-2 text-xs text-gray-500">{lang === 'ar' ? 'بدون تداول وبدون أي وعود أرباح.' : 'No trading. No profit guarantees.'}</div>
          </div>

          <div className={`text-xs text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'الأسعار المقترحة:' : 'Suggested pricing:'} {monthly} • {yearly}
          </div>

          <Link
            href="/premium"
            className="inline-flex items-center px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors"
          >
            {lang === 'ar' ? 'اشترك بريميوم' : 'Go Premium'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-slate-400`}>
      <div className={`flex items-center justify-between mb-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
        <h2 className={`text-lg font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
          {lang === 'ar' ? 'الفضة (XAG)' : 'Silver (XAG)'}
        </h2>
        <div className="flex items-center gap-2">
          {country === 'EG' && (
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'local' ? 'global' : 'local'))}
              className="text-xs text-gray-300 hover:text-white border border-gray-700 rounded px-2 py-1"
            >
              {mode === 'local' ? (lang === 'ar' ? 'محلي' : 'Local') : (lang === 'ar' ? 'عالمي' : 'Global')}
            </button>
          )}
          {mode === 'global' && (
            <button
              type="button"
              onClick={() => setUnit((u) => (u === 'g' ? 'oz' : 'g'))}
              className="text-xs text-gray-300 hover:text-white border border-gray-700 rounded px-2 py-1"
            >
              {unit === 'g' ? (lang === 'ar' ? 'عرض /أونصة' : 'Show /oz') : (lang === 'ar' ? 'عرض /جرام' : 'Show /g')}
            </button>
          )}
        </div>
      </div>

      <div className={`rounded-md border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs text-amber-200 ${lang === 'ar' ? 'text-right' : ''}`}>
        <div className="font-semibold">{lang === 'ar' ? 'الفضة أكثر تقلبًا' : 'Silver is more volatile'}</div>
        <div className="mt-1">
          {lang === 'ar'
            ? 'الفضة تتحرك أسرع من الذهب وقد تغيّر اتجاهها بسرعة. اعتبرها إشارة وليست ضمانًا.'
            : 'Silver moves faster than gold and can change direction quickly. Use it as a signal, not certainty.'}
        </div>
      </div>

      <div className={`mt-2 text-xs text-gray-500 ${lang === 'ar' ? 'text-right' : ''}`}>
        {mode === 'local'
          ? (lang === 'ar' ? 'مصدر موثوق: SafeHavenHub (أسعار سوق محلية)' : 'Trusted source: SafeHavenHub (local market table)')
          : (lang === 'ar'
              ? 'مُشتق من السعر العالمي للفضة (XAG) + سعر الصرف'
              : 'Derived from global silver spot (XAG) + FX rate')}
      </div>

      {mode === 'local' ? (
        <div className="mt-3 space-y-3">
          <div className={`flex items-center justify-between gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="text-xs text-gray-400">{lang === 'ar' ? 'العيار' : 'Karat'}</div>
            <select
              value={karat}
              onChange={(e) => setKarat(Number(e.target.value) as Karat)}
              className="bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-sm text-gray-200"
            >
              <option value={999}>999</option>
              <option value={925}>925</option>
              <option value={900}>900</option>
              <option value={800}>800</option>
            </select>
          </div>

          <div className={`flex items-center justify-between gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="flex-1">
              <div className="text-xs text-gray-400">{lang === 'ar' ? 'شراء' : 'Buy'}</div>
              <div className="text-2xl font-bold text-gray-100">
                {loading ? '—' : selectedLocal?.buy_price != null ? selectedLocal.buy_price.toLocaleString() : '—'}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-400">{lang === 'ar' ? 'بيع' : 'Sell'}</div>
              <div className="text-2xl font-bold text-gray-100">
                {loading ? '—' : selectedLocal?.sell_price != null ? selectedLocal.sell_price.toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className={`flex items-center justify-between gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="text-xs text-gray-400">
              {lang === 'ar' ? 'التغير' : 'Change'}: {selectedLocal?.change_pct != null ? `${selectedLocal.change_pct.toFixed(2)}%` : '—'}
            </div>
            <div className="text-xs text-gray-300">
              {lang === 'ar' ? 'الثقة' : 'Confidence'}:{' '}
              <span className="font-semibold">{labelConfidence(lang, selectedLocal?.confidence ?? 'low')}</span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SignalTrustBadges lastUpdatedAt={selectedLocal?.lastUpdatedAt ?? null} />
            <ShareSignalButton
              direction={localDirection}
              country={country}
              scope="local"
              price={selectedLocal?.buy_price ?? null}
              currency={localCurrencyLabel}
              lastUpdatedAt={selectedLocal?.lastUpdatedAt ?? null}
            />
          </div>
        </div>
      ) : (
        <>
          <div className={`mt-3 flex items-center justify-between gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="flex-1">
              <div className="text-2xl font-bold text-gray-100">
                {loading ? '—' : price != null ? price.toLocaleString(undefined, { maximumFractionDigits: unit === 'g' ? 2 : 2 }) : '—'}
              </div>
              <div className="text-xs text-gray-400">{data?.currency ?? '—'} {priceLabel}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${directionColor}`}>
                {data?.direction ?? 'STALE'}
              </span>
              <div className="text-xs text-gray-300">
                {lang === 'ar' ? 'الثقة' : 'Confidence'}: <span className="font-semibold">{labelConfidence(lang, data?.confidence ?? 'low')}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SignalTrustBadges lastUpdatedAt={data?.lastUpdatedAt ?? null} />
            <ShareSignalButton
              direction={data?.direction ?? 'STALE'}
              country={country}
              scope="global"
              price={price}
              currency={data?.currency ?? null}
              lastUpdatedAt={data?.lastUpdatedAt ?? null}
            />
          </div>
        </>
      )}
    </div>
  );
}

