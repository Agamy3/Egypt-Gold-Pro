'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import SourceAuditPanel from '@/components/SourceAuditPanel';
import ForecastCard from '@/components/ForecastCard';
import TrustedModeToggle from '@/components/TrustedModeToggle';
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
  const [showDebug, setShowDebug] = useState(false);

  const fetchSnapshot = async () => {
    try {
      // Get trusted mode preference from localStorage
      const trustedMode = localStorage.getItem('egyptTrustedOnlyMode') === 'true';
      const url = `/api/marketSnapshot${trustedMode ? '?trustedMode=true' : ''}`;
      
      const res = await fetch(url, {
        headers: {
          'x-trusted-mode': trustedMode ? 'true' : 'false',
        },
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
      // Get trusted mode preference from localStorage
      const trustedMode = localStorage.getItem('egyptTrustedOnlyMode') === 'true';
      const url = `/api/forecast${trustedMode ? '?trustedMode=true' : ''}`;
      
      const res = await fetch(url, {
        headers: {
          'x-trusted-mode': trustedMode ? 'true' : 'false',
        },
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

  const handleTrustedModeToggle = (enabled: boolean) => {
    // Refresh data when mode changes
    fetchSnapshot();
    fetchForecast();
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
              <TrustedModeToggle onToggle={handleTrustedModeToggle} />
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="px-4 py-2 text-sm bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
              >
                {showDebug ? (lang === 'ar' ? 'إخفاء' : 'Hide') : t(lang, 'showSourceAudit')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {snapshot && (
          <>
            <Dashboard snapshot={snapshot} />
            {forecast && (
              <div className="mt-6">
                <ForecastCard 
                  forecast={forecast.forecast} 
                  insufficientData={forecast.insufficientData}
                />
              </div>
            )}
            {showDebug && <SourceAuditPanel />}
          </>
        )}
      </main>
    </div>
  );
}

