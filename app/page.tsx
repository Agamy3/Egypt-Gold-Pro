'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Dashboard from '@/components/Dashboard';
import ForecastCard from '@/components/ForecastCard';
import MoneyToGoldCalculator from '@/components/MoneyToGoldCalculator';
import LanguageToggle from '@/components/LanguageToggle';
import CountryCurrencySelector from '@/components/CountryCurrencySelector';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';
import { useLang } from '@/components/LanguageProvider';
import { t } from '@/lib/i18n';
import { useSearchParams } from 'next/navigation';

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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className={`flex flex-col sm:flex-row items-start sm:items-center ${lang === 'ar' ? 'sm:flex-row-reverse' : ''} gap-3 sm:gap-4 justify-between`}>
            <Link href="/" className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                <Image
                  src="/brand/logo.png"
                  alt="EgyptGold Pro"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 640px) 48px, 56px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">{t(lang, 'appTitle')}</h1>
                <p className="text-xs sm:text-sm text-gray-300 mt-1">
                  {(() => {
                    const countryNames: Record<string, { en: string; ar: string }> = {
                      EG: { en: 'Egyptian', ar: 'المصرية' },
                      AE: { en: 'UAE', ar: 'الإماراتية' },
                      SA: { en: 'Saudi', ar: 'السعودية' },
                      US: { en: 'USA', ar: 'الولايات المتحدة' },
                    };
                    const countryName = countryNames[country] || countryNames.EG;
                    return lang === 'ar' 
                      ? `دعم قرار تعليمي لسوق الذهب ${countryName.ar}`
                      : `Educational decision-support for the ${countryName.en} gold market`;
                  })()}
                </p>
              </div>
            </Link>
            <div className={`flex items-center gap-2 sm:gap-4 w-full sm:w-auto ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <CountryCurrencySelector />
              <LanguageToggle />
              <AccountMenu />
            </div>
          </div>
        </div>
      </header>

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

