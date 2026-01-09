'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import ForecastCard from '@/components/ForecastCard';
import ResourcesNavigator from '@/components/ResourcesNavigator';
import LanguageToggle from '@/components/LanguageToggle';
import { useLang } from '@/components/LanguageProvider';
import { t } from '@/lib/i18n';

interface MarketSnapshot {
  timestamp: number;
    impliedOunce: {
      impliedOunceUsd: number;
      source: 'gold-api.com';
      timestamp: number;
      stale: boolean;
    } | null;
  egyptMarket: {
    median: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
    };
    sources: Array<{
      source: string;
      status: string;
      fetchedAt: number;
    }>;
    activeSourceCount: number;
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
      source: string;
      fetchedAt: number | null;
      stale: boolean;
      error?: string;
    };
  };
  warnings: {
    lowConfidence: boolean;
    referenceUnavailable: boolean;
  };
}

export default function Home() {
  const { lang } = useLang();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = async () => {
    try {
      const res = await fetch('/api/marketSnapshot', {
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
  };

  const fetchForecast = async () => {
    try {
      const res = await fetch('/api/forecast', {
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
  };


  useEffect(() => {
    fetchSnapshot();
    fetchForecast();
    const interval = setInterval(() => {
      fetchSnapshot();
      fetchForecast();
    }, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

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
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className={`flex items-center ${lang === 'ar' ? 'flex-row-reverse' : ''} justify-between`}>
            <div>
              <h1 className="text-3xl font-bold text-gold-400">{t(lang, 'appTitle')}</h1>
              <p className="text-sm text-gray-300 mt-1">
                {t(lang, 'appSubtitle')}
              </p>
            </div>
            <div className={`flex items-center gap-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {snapshot && (
          <>
            <Dashboard snapshot={snapshot} />
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {forecast && (
                <div className="lg:col-span-2">
                  <ForecastCard 
                    forecast={forecast.forecast} 
                    insufficientData={forecast.insufficientData}
                  />
                </div>
              )}
              <div className="lg:col-span-1">
                <ResourcesNavigator
                  impliedOunce={snapshot.impliedOunce}
                  fx={snapshot.pricing.fx}
                  egyptMarket={snapshot.egyptMarket}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

