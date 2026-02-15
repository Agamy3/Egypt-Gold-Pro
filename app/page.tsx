'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import Dashboard from '@/components/Dashboard';
import GoldSignalCard from '@/components/GoldSignalCard';
import GoldConverter from '@/components/GoldConverter';
import MoneyToGoldCalculator from '@/components/MoneyToGoldCalculator';
import Footer from '@/components/Footer';
import AdGateClient from '@/components/ads/AdGateClient';
import { useLang } from '@/components/LanguageProvider';
import { t } from '@/lib/i18n';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';

interface MarketSnapshot {
  timestamp: number;
    impliedOunce: {
      impliedOunceUsd: number;
      source: 'gold-api.com';
      timestamp: number;
      stale: boolean;
    } | null;
  market: {
    median: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
      market18Buy?: number | null;
      market18Sell?: number | null;
      market14Buy?: number | null;
      market14Sell?: number | null;
    };
    canonicalMedian?: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
      market18Buy?: number | null;
      market18Sell?: number | null;
      market14Buy?: number | null;
      market14Sell?: number | null;
    };
    sources: Array<{
      source: string;
      status: string;
      fetchedAt: number;
    }>;
    activeSourceCount: number;
    activeUnderlyingSourceCount?: number;
    activeUnderlyingSources?: string[];
    sourcesUsed?: Record<string, string[]>;
  };
  pricing: {
    usdPerGram24: number | null;
    usdPerGram21: number | null;
    usdEgpGold: number | null;
    localMarketParity: {
      local24: number | null;
      local21: number | null;
    };
    fairValue: {
      fair24: number | null;
      fair21: number | null;
    };
    variance: {
      variancePct: number | null;
      premiumEGP: number | null;
      classification: 'FAIR' | 'PREMIUM' | 'DISCOUNT' | 'N/A';
    };
      fx?: {
        usdEgp: number | null;
        usdAed?: number | null;
        usdSar?: number | null;
        source: string;
        fetchedAt: number | null;
        stale: boolean;
        errors?: Record<string, string>;
        error?: string;
      };
  };
  warnings: {
    lowConfidence: boolean;
    referenceUnavailable: boolean;
    fxUnavailable?: boolean;
    buyOnlyVariance?: boolean;
  };
  country?: string;
  currency?: string;
  canonicalCurrency?: string;
}

function HomeContent() {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get country and currency from URL params
  const country = (searchParams.get('country') || 'EG') as 'EG' | 'AE' | 'SA' | 'US';
  const currency = (searchParams.get('currency') || 'EGP') as 'EGP' | 'USD' | 'AED' | 'SAR';

  const fetchSnapshot = useCallback(async () => {
    try {
      const url = `/api/marketSnapshot?country=${country}&currency=${currency}`;
      const res = await fetch(url, {
        cache: 'no-store', // Ensure fresh data on every fetch
      });
      if (!res.ok) {
        throw new Error('Failed to fetch market snapshot');
      }
      const data = await res.json();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      // Only set loading to false on initial load
      if (loading) {
        setLoading(false);
      }
    }
  }, [country, currency, loading]);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(() => {
      fetchSnapshot();
    }, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSnapshot]); // Re-fetch when country/currency changes

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t(lang, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchSnapshot}
            className="px-4 py-2 bg-gold-600 text-white rounded hover:bg-gold-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const countryNames: Record<string, { en: string; ar: string }> = {
    EG: { en: 'Egyptian', ar: 'المصرية' },
    AE: { en: 'UAE', ar: 'الإماراتية' },
    SA: { en: 'Saudi', ar: 'السعودية' },
    US: { en: 'USA', ar: 'الولايات المتحدة' },
  };
  const countryName = countryNames[country] || countryNames.EG;
  const subtitle = lang === 'ar' 
    ? `دعم قرار تعليمي لسوق الذهب ${countryName.ar}`
    : `Educational decision-support for the ${countryName.en} gold market`;

  // Publisher content block (used for AdSense gating and also visible to users).
  // Keep it substantial so ads never show on thin/utility screens.
  const publisherText =
    lang === 'ar'
      ? [
          'ملاحظة تعليمية: هذا التطبيق يقدّم أدوات لمساعدتك على فهم سوق الذهب وليس نصيحة استثمارية. نعرض أسعار الذهب المحلية (مثل عيار 21 و24) من مصادر سوقية، ونقارنها بسعر الذهب العالمي (XAU/USD) بعد التحويل إلى جرام باستخدام وزن الأونصة الترويسية (31.1034768 جرام).',
          'الهدف هو توضيح: كيف تتغيّر الأسعار مع سعر الصرف، وكيف يظهر “فرق السعر” بين السوق المحلي والسعر المرجعي، وكيف تؤثر أخبار الاقتصاد الكلي مثل التضخم وأسعار الفائدة على حركة الذهب. إذا كانت البيانات ناقصة أو متأخرة، نعرض تنبيهات واضحة ونمتنع عن الاستنتاجات غير الموثوقة.',
          'استخدم هذه الصفحة لفهم الاتجاه العام، مقارنة الفترات، ومراجعة العوامل الرئيسية قبل اتخاذ أي قرار. يمكنك أيضاً متابعة الأخبار المرتبطة بالذهب على صفحة الأخبار لمعرفة ما الذي يحرك الأسعار عالمياً.',
        ].join(' ')
      : [
          'Educational note: EgyptGold Pro provides decision-support tools to help you understand the gold market; it is not investment advice. We display local market prices (e.g., 21k and 24k) from market sources and compare them to the global spot price (XAU/USD) converted to grams using the troy ounce standard (31.1034768g).',
          'The goal is to explain how prices move with FX, how a local “premium/discount” can appear versus a reference price, and how macro forces like inflation and interest rates can influence gold. When data is missing or delayed, we show clear warnings and avoid unreliable conclusions.',
          'Use this dashboard to understand the direction, compare recent changes, and review key drivers before making any decision. For deeper context, check the News page to see what is moving gold globally.',
        ].join(' ');
  const publisherTextLength = publisherText.length;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header 
        title={t(lang, 'appTitle')}
        subtitle={subtitle}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {snapshot && (
          <>
            <Dashboard snapshot={{ ...snapshot, country }} />
            <div className="mt-4 sm:mt-6">
              <MoneyToGoldCalculator
                country={country}
                currency={currency}
                snapshot={snapshot}
              />
            </div>
            <div className="mt-4 sm:mt-6">
              <GoldSignalCard country={country === 'EG' ? 'EG' : 'GLOBAL'} />
            </div>
            <div className="mt-4 sm:mt-6">
              <GoldConverter
                country={country}
                availableKarats={(() => {
                  const ks: Array<24 | 21 | 18 | 14> = [24];
                  if (snapshot?.market?.median?.market21Buy !== null) ks.push(21);
                  if (snapshot?.market?.median?.market18Buy !== null) ks.push(18);
                  if (snapshot?.market?.median?.market14Buy !== null) ks.push(14);
                  return Array.from(new Set(ks));
                })()}
              />
            </div>
            <section className="mt-6 sm:mt-8 rounded-lg border border-gray-800 bg-gray-900 p-4 sm:p-5">
              <h2 className="text-base sm:text-lg font-semibold text-gold-400">
                {lang === 'ar' ? 'كيف نستخدم هذه الصفحة؟' : 'How to use this dashboard'}
              </h2>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                {publisherText}
              </p>
            </section>
            {/* Dashboard Ad - far down the page, only once we have a full snapshot */}
            <div className="mt-6 sm:mt-8 lg:mt-10">
              <AdGateClient
                adSlot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD || '9450111383'}
                format="auto"
                className="w-full"
                // Snapshot + dashboard cards + calculator + forecast = rich content
                hasMeaningfulContent={Boolean(snapshot)}
                textLength={publisherTextLength}
                requireScroll
              />
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}

