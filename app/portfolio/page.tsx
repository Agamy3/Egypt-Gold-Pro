'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider';
import PortfolioTable from '@/components/PortfolioTable';
import Footer from '@/components/Footer';
import AdGateClient from '@/components/ads/AdGateClient';
import Header from '@/components/layout/Header';

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
    current_value_selected: number | null;
    current_price_per_gram_selected: number | null;
    pnl: number | null;
    pnl_pct: number | null;
    status: 'WIN' | 'LOSS' | 'FLAT';
  }>;
  karatAggregates: Array<{
    karat: Karat;
    total_grams: number;
    avg_buy_price_per_gram_selected: number;
    current_price_per_gram_selected: number | null;
    invested_value_selected: number;
    current_value_selected: number | null;
    pnl: number | null;
    pnl_pct: number | null;
    status: 'WIN' | 'LOSS' | 'FLAT';
  }>;
  totals: {
    invested_value_selected: number;
    current_value_selected: number | null;
    pnl: number | null;
    pnl_pct: number | null;
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

  const holdingsCount = portfolio?.holdings?.length ?? 0;

  return (
    <>
      <Header title={lang === 'ar' ? 'المحفظة' : 'Portfolio'} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10">
        {portfolio && holdingsCount > 0 && (
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
                  {formatCurrency(portfolio.totals.pnl, currency)} ({portfolio.totals.pnl_pct === null ? 'N/A' : `${formatNumber(portfolio.totals.pnl_pct * 100, 2)}%`})
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
                      {agg.pnl_pct !== null && Math.abs(agg.pnl_pct) >= 0.05 && (
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
                          {formatCurrency(agg.pnl, currency)} ({agg.pnl_pct === null ? 'N/A' : `${formatNumber(agg.pnl_pct * 100, 2)}%`})
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

        {/* Empty portfolio state (no holdings yet) */}
        {portfolio && holdingsCount === 0 && (
          <div className="mt-6 sm:mt-8 lg:mt-10 max-w-3xl mx-auto space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 sm:p-6 lg:p-8 space-y-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-gold-400">
                {lang === 'ar' ? 'ابدأ في بناء محفظة الذهب الخاصة بك' : 'Start building your gold portfolio'}
              </h2>
              <p className="text-sm text-gray-300">
                {lang === 'ar'
                  ? 'لا توجد أي ممتلكات مسجلة حتى الآن. استخدم أداة إضافة المقتنيات لإدخال وزن الذهب الذي تملكه وسعر الشراء لتتبع الأداء بمرور الوقت.'
                  : "You don't have any holdings recorded yet. Use the add holdings tool to enter the gold you own and your purchase prices so you can track your performance over time."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-300">
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-100">
                    {lang === 'ar' ? 'ماذا تفعل المحفظة؟' : 'What does the portfolio do?'}
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-300">
                    <li>
                      {lang === 'ar'
                        ? 'تحسب القيمة الحالية لممتلكاتك بناءً على أسعار السوق المحلية.'
                        : 'Calculates the current value of your holdings using live local market prices.'}
                    </li>
                    <li>
                      {lang === 'ar'
                        ? 'تظهر لك الربح أو الخسارة لكل عيار وكذلك للمحفظة بالكامل.'
                        : 'Shows your profit or loss by karat and for your portfolio overall.'}
                    </li>
                    <li>
                      {lang === 'ar'
                        ? 'تساعدك على فهم تأثير تغيّر الأسعار وسعر الصرف على استثماراتك.'
                        : 'Helps you understand how local prices and FX moves impact your gold savings.'}
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-100">
                    {lang === 'ar' ? 'كيف أبدأ؟' : 'How do I get started?'}
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-300">
                    <li>
                      {lang === 'ar'
                        ? 'اضغط على زر "+ إضافة" أدناه لإضافة أول عملية شراء.'
                        : 'Click the "+ Add" button below to add your first purchase.'}
                    </li>
                    <li>
                      {lang === 'ar'
                        ? 'أدخل العيار، الوزن بالجرام، وسعر الشراء لكل جرام.'
                        : 'Enter karat, grams, and your purchase price per gram.'}
                    </li>
                    <li>
                      {lang === 'ar'
                        ? 'يمكنك تعديل أو حذف أي عملية لاحقاً مع تغيّر استراتيجيتك.'
                        : 'You can edit or remove entries later as your strategy changes.'}
                    </li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {lang === 'ar'
                  ? 'ملاحظة: هذه الأداة تعليمية ولا تُعتبر نصيحة استثمارية.'
                  : 'Note: This tool is for educational purposes only and is not investment advice.'}
              </p>
            </div>
            
            {/* Show PortfolioTable with Add button even when empty */}
            <PortfolioTable
              holdings={[]}
              currency={currency}
              country={country}
              lang={lang}
              onRefresh={fetchPortfolio}
            />
          </div>
        )}

        {/* Ad at bottom of page (for free users only) - only when portfolio has data */}
        {portfolio && holdingsCount > 0 && (
          <div className="mt-8 mb-4">
            <AdGateClient
              adSlot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD || '9450111383'}
              format="auto"
              className="w-full"
              hasMeaningfulContent={holdingsCount >= 3}
              requireScroll
            />
          </div>
        )}
      </main>
      <Footer />
    </>
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

