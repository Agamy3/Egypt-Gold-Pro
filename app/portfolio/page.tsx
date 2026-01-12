'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import CountryCurrencySelector from '@/components/CountryCurrencySelector';
import LanguageToggle from '@/components/LanguageToggle';
import AccountMenu from '@/components/AccountMenu';
import PortfolioTable from '@/components/PortfolioTable';
import Footer from '@/components/Footer';
import Image from 'next/image';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';
type Karat = 14 | 18 | 21 | 24;

interface PortfolioData {
  holdings: Array<{
    id: number;
    country: Country | null;
    karat: Karat;
    grams: number;
    purchase_price_per_gram: number;
    purchase_currency: Currency;
    purchased_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    invested_value_selected: number;
    current_value_selected: number;
    current_price_per_gram_selected: number | null;
    pnl: number;
    pnl_pct: number;
    status: 'WIN' | 'LOSS' | 'FLAT';
  }>;
  karatAggregates: Array<{
    karat: Karat;
    total_grams: number;
    avg_buy_price_per_gram_selected: number;
    current_price_per_gram_selected: number | null;
    invested_value_selected: number;
    current_value_selected: number;
    pnl: number;
    pnl_pct: number;
    status: 'WIN' | 'LOSS' | 'FLAT';
  }>;
  totals: {
    invested_value_selected: number;
    current_value_selected: number;
    pnl: number;
    pnl_pct: number;
    status: 'WIN' | 'LOSS' | 'FLAT';
  };
  referenceUnavailable: boolean;
  currency: Currency;
  country: Country;
}

function formatNumber(num: number | null, decimals = 2): string {
  if (num === null) return 'N/A';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(num: number | null, currency: Currency, decimals = 2): string {
  if (num === null) return 'N/A';
  const symbol = currency === 'EGP' ? 'EGP' : currency === 'AED' ? 'AED' : currency === 'SAR' ? 'SAR' : '$';
  return `${symbol} ${formatNumber(num, decimals)}`;
}

function PortfolioContent() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const country = (searchParams.get('country') || 'EG') as Country;
  const currency = (searchParams.get('currency') || (country === 'EG' ? 'EGP' : country === 'AE' ? 'AED' : country === 'SA' ? 'SAR' : 'USD')) as Currency;

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/portfolio?country=${country}&currency=${currency}`, {
        cache: 'no-store',
      });

      if (res.status === 401) {
        // Not authenticated - redirect to sign in
        router.push('/auth/signin');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to fetch portfolio');
        return;
      }

      const data = await res.json();
      setPortfolio(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, [country, currency, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && error !== 'Unauthorized') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
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
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">
                  {lang === 'ar' ? 'المحفظة' : 'Portfolio'}
                </h1>
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
        {portfolio && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-blue-600">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {lang === 'ar' ? 'إجمالي المستثمر' : 'Total Invested'}
                </h3>
                <p className="text-2xl font-bold text-gray-100">
                  {formatCurrency(portfolio.totals.invested_value_selected, currency)}
                </p>
              </div>

              <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-green-600">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {lang === 'ar' ? 'القيمة الحالية' : 'Current Value'}
                </h3>
                <p className="text-2xl font-bold text-gray-100">
                  {formatCurrency(portfolio.totals.current_value_selected, currency)}
                </p>
              </div>

              <div className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 ${
                portfolio.totals.status === 'WIN' ? 'border-green-600' :
                portfolio.totals.status === 'LOSS' ? 'border-red-600' : 'border-gray-600'
              }`}>
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {lang === 'ar' ? 'الربح/الخسارة' : 'Profit/Loss'}
                </h3>
                <p className={`text-2xl font-bold ${
                  portfolio.totals.status === 'WIN' ? 'text-green-400' :
                  portfolio.totals.status === 'LOSS' ? 'text-red-400' : 'text-gray-300'
                }`}>
                  {formatCurrency(portfolio.totals.pnl, currency)} ({formatNumber(portfolio.totals.pnl_pct * 100, 2)}%)
                </p>
              </div>

              <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-purple-600">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {lang === 'ar' ? 'الحالة' : 'Status'}
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    portfolio.totals.status === 'WIN' ? 'bg-green-600 text-white' :
                    portfolio.totals.status === 'LOSS' ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-200'
                  }`}>
                    {portfolio.totals.status === 'WIN' ? (lang === 'ar' ? 'ربح' : 'WIN') :
                     portfolio.totals.status === 'LOSS' ? (lang === 'ar' ? 'خسارة' : 'LOSS') :
                     (lang === 'ar' ? 'متساوي' : 'FLAT')}
                  </span>
                </div>
              </div>
            </div>

            {/* Breakdown by Karat */}
            <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
              <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'التفصيل حسب العيار' : 'Breakdown by Karat'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {portfolio.karatAggregates.map((agg) => (
                  <div key={agg.karat} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-300">
                        {agg.karat}k
                      </h3>
                      {Math.abs(agg.pnl_pct) >= 0.05 && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          agg.status === 'WIN' ? 'bg-green-600 text-white' :
                          agg.status === 'LOSS' ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-200'
                        }`}>
                          {agg.status}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'ar' ? 'الجرامات' : 'Grams'}</span>
                        <span className="text-gray-200">{formatNumber(agg.total_grams, 2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'ar' ? 'متوسط السعر' : 'Avg Buy'}</span>
                        <span className="text-gray-200">{formatCurrency(agg.avg_buy_price_per_gram_selected, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'ar' ? 'السعر الحالي' : 'Current'}</span>
                        <span className="text-gray-200">{formatCurrency(agg.current_price_per_gram_selected, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'ar' ? 'ربح/خسارة' : 'P/L'}</span>
                        <span className={`${
                          agg.status === 'WIN' ? 'text-green-400' :
                          agg.status === 'LOSS' ? 'text-red-400' : 'text-gray-300'
                        }`}>
                          {formatCurrency(agg.pnl, currency)} ({formatNumber(agg.pnl_pct * 100, 2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Holdings Table */}
            <PortfolioTable
              holdings={portfolio.holdings}
              currency={portfolio.currency}
              country={portfolio.country}
              lang={lang}
              onRefresh={fetchPortfolio}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
        </div>
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  );
}

