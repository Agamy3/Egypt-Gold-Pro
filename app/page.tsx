'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import Dashboard from '@/components/Dashboard';
import ForecastCard from '@/components/ForecastCard';
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
  const [forecast, setForecast] = useState<any>(null);
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

  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch(`/api/forecast?country=${country}`, {
        cache: 'no-store', // Ensure fresh data on every fetch
      });
      if (res.ok) {
        const data = await res.json();
        setForecast(data);
      }
    } catch (err) {
      // Forecast errors are non-critical, don't set error state
      console.error('Forecast fetch error:', err);
    }
  }, [country]);

  useEffect(() => {
    fetchSnapshot();
    fetchForecast();
    const interval = setInterval(() => {
      fetchSnapshot();
      fetchForecast();
    }, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSnapshot, fetchForecast]); // Re-fetch when country/currency changes

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
            {forecast && (
              <div className="mt-4 sm:mt-6">
                <ForecastCard 
                  forecast={forecast.forecast} 
                  insufficientData={forecast.insufficientData}
                  country={country}
                />
              </div>
            )}
            {/* Dashboard Ad - far down the page, only once we have a full snapshot */}
            <div className="mt-6 sm:mt-8 lg:mt-10">
              <AdGateClient
                adSlot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD || '9450111383'}
                format="auto"
                className="w-full"
                // Snapshot + dashboard cards + calculator + forecast = rich content
                hasMeaningfulContent={Boolean(snapshot)}
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

