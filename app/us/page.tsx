'use client';

import { useEffect, useState, Suspense } from 'react';
import Footer from '@/components/Footer';
import ForecastCard from '@/components/ForecastCard';
import Header from '@/components/layout/Header';
import { useLang } from '@/components/LanguageProvider';
import { useSearchParams } from 'next/navigation';

// Constants for US retail premium estimates
const RETAIL_PREMIUM_PCT = 0.03; // 3% default
const COIN_PREMIUM_PCT = 0.05; // 5% for American Eagle
const TROY_OUNCE_TO_GRAM = 31.1034768;

interface MarketSnapshot {
  timestamp: number;
  impliedOunce: {
    impliedOunceUsd: number;
    source: 'gold-api.com';
    timestamp: number;
    stale: boolean;
  } | null;
  pricing: {
    usdPerGram24: number | null;
    usdPerGram21: number | null;
  };
  country?: string;
  currency?: string;
}

function formatNumber(num: number | null, decimals = 2): string {
  if (num === null) return 'N/A';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function calculateDaysUntil(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const nowDate = new Date(now);
  nowDate.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - nowDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function USPageContent() {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [macro, setMacro] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currency = (searchParams.get('currency') || 'USD') as 'USD';

  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const url = `/api/marketSnapshot?country=US&currency=USD`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch market snapshot');
        const data = await res.json();
        setSnapshot(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    const fetchForecast = async () => {
      try {
        const res = await fetch('/api/forecast?country=US', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setForecast(data);
        }
      } catch (err) {
        console.error('Forecast fetch error:', err);
      }
    };

    const fetchMacro = async () => {
      try {
        const res = await fetch('/api/us/macro', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setMacro(data);
        }
      } catch (err) {
        console.error('Macro fetch error:', err);
      }
    };

    fetchSnapshot();
    fetchForecast();
    fetchMacro();
    const interval = setInterval(() => {
      fetchSnapshot();
      fetchForecast();
      fetchMacro();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gold-600 text-white rounded hover:bg-gold-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Calculate retail premiums
  const spot24kPerGram = snapshot?.pricing?.usdPerGram24 || null;
  const retail24kPerGram = spot24kPerGram ? spot24kPerGram * (1 + RETAIL_PREMIUM_PCT) : null;
  const premiumPerGram = spot24kPerGram && retail24kPerGram ? retail24kPerGram - spot24kPerGram : null;
  const spotPerOunce = snapshot?.impliedOunce?.impliedOunceUsd || null;
  const retailPerOunce = spotPerOunce ? spotPerOunce * (1 + RETAIL_PREMIUM_PCT) : null;
  const coinPerOunce = retailPerOunce ? retailPerOunce * (1 + COIN_PREMIUM_PCT) : null;

  return (
    <>
      <Header 
        title={lang === 'ar' ? 'معلومات سوق الذهب الأمريكي' : 'US Gold Market Overview'}
        subtitle={lang === 'ar' 
          ? 'دعم قرار تعليمي لسوق الذهب الأمريكي'
          : 'Educational decision-support for the US gold market'}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-xs text-gray-400 italic py-2 ${lang === 'ar' ? 'text-right' : ''}`}>
          {lang === 'ar' 
            ? 'للاستخدام التعليمي فقط. قد تنطبق علاوات البيع بالتجزئة والضرائب.'
            : 'Educational only. Retail premiums/taxes may apply.'}
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {snapshot && (
          <div className="space-y-4 sm:space-y-6">
            {/* Global Spot Gold */}
            <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-gold-600">
              <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                {lang === 'ar' ? 'السعر الفوري العالمي للذهب' : 'Global Spot Gold (USD)'}
              </h2>
              {snapshot.impliedOunce ? (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-gold-700 mb-2">
                    ${formatNumber(snapshot.impliedOunce.impliedOunceUsd, 2)}
                  </div>
                  <div className="text-sm text-gray-300">
                    USD per troy ounce
                  </div>
                </>
              ) : (
                <div className="text-red-400 font-semibold">N/A</div>
              )}
            </div>

            {/* Spot vs Retail Premium */}
            {spot24kPerGram && (
              <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-blue-600">
                <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  {lang === 'ar' ? 'العلاوة على السعر الفوري مقابل البيع بالتجزئة (تقدير)' : 'Spot vs Retail Premium (Est.)'}
                </h2>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">
                      {lang === 'ar' ? 'السعر الفوري (24k/جرام)' : 'Spot Price (24k/gram)'}
                    </div>
                    <div className="text-xl font-bold text-gray-100">
                      ${formatNumber(spot24kPerGram, 2)}
                    </div>
                  </div>
                  {retail24kPerGram && premiumPerGram && (
                    <>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">
                          {lang === 'ar' ? 'السعر التقديري للبيع بالتجزئة (24k/جرام)' : 'Estimated Retail (24k/gram)'}
                        </div>
                        <div className="text-xl font-bold text-blue-400">
                          ${formatNumber(retail24kPerGram, 2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">
                          {lang === 'ar' ? 'العلاوة' : 'Premium'}
                        </div>
                        <div className="text-lg font-semibold text-gray-300">
                          {formatNumber(RETAIL_PREMIUM_PCT * 100, 1)}% (+${formatNumber(premiumPerGram, 2)}/gram)
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className={`mt-4 text-xs text-gray-400 italic ${lang === 'ar' ? 'text-right' : ''}`}>
                  {lang === 'ar' 
                    ? 'تقدير إرشادي — تختلف علاوات التجار.'
                    : 'Indicative estimate — dealer premiums vary.'}
                </div>
              </div>
            )}

            {/* Investment Products */}
            {spotPerOunce && (
              <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-purple-600">
                <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  {lang === 'ar' ? 'مكافئات منتجات الاستثمار' : 'Investment Products Equivalents'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {retailPerOunce && (
                    <div className="bg-gray-800 rounded p-3">
                      <div className="text-sm text-gray-400 mb-1">
                        {lang === 'ar' ? '1 أونصة بار' : '1 oz Bar'}
                      </div>
                      <div className="text-xl font-bold text-purple-400">
                        ${formatNumber(retailPerOunce, 2)}
                      </div>
                    </div>
                  )}
                  {retailPerOunce && (
                    <div className="bg-gray-800 rounded p-3">
                      <div className="text-sm text-gray-400 mb-1">
                        {lang === 'ar' ? '10 أونصة بار' : '10 oz Bar'}
                      </div>
                      <div className="text-xl font-bold text-purple-400">
                        ${formatNumber(retailPerOunce * 10, 2)}
                      </div>
                    </div>
                  )}
                  {coinPerOunce && (
                    <div className="bg-gray-800 rounded p-3">
                      <div className="text-sm text-gray-400 mb-1">
                        {lang === 'ar' ? '1 أونصة عملة (النسر الأمريكي)' : '1 oz Coin (American Eagle)'}
                      </div>
                      <div className="text-xl font-bold text-purple-400">
                        ${formatNumber(coinPerOunce, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Macro Context */}
            <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-green-600">
              <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                {lang === 'ar' ? 'السياق الكلي' : 'Macro Context'}
              </h2>
              {macro && !macro.error ? (
                <div className="space-y-4">
                  {/* Fed Funds Target Range */}
                  {macro.fedFundsTargetRange && (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-green-400">
                          {lang === 'ar' ? 'نطاق هدف سعر الفائدة الفيدرالي' : 'Fed Funds Target'}
                        </div>
                        <div className="text-lg font-bold text-gray-100">
                          {macro.fedFundsTargetRange.lower}%–{macro.fedFundsTargetRange.upper}%
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {lang === 'ar' ? 'حسب' : 'as of'} {new Date(macro.fedFundsTargetRange.asOf).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  )}

                  {/* Next FOMC Meeting */}
                  {macro.nextFomc && (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-green-400">
                          {lang === 'ar' ? 'اجتماع FOMC القادم' : 'Next FOMC'}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-bold text-gray-100">
                            {new Date(macro.nextFomc.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–
                            {new Date(macro.nextFomc.end).toLocaleDateString('en-US', { day: 'numeric' })}
                          </div>
                          {macro.nextFomc.isSEP && (
                            <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
                              SEP
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {macro.daysUntilNextFomcEnd !== null && macro.daysUntilNextFomcEnd >= 0
                          ? (lang === 'ar' 
                              ? `${macro.daysUntilNextFomcEnd} ${macro.daysUntilNextFomcEnd === 1 ? 'يوم' : 'أيام'} حتى القرار`
                              : `${macro.daysUntilNextFomcEnd} ${macro.daysUntilNextFomcEnd === 1 ? 'day' : 'days'} until decision`)
                          : (lang === 'ar' ? 'قريباً' : 'Upcoming')}
                      </div>
                    </div>
                  )}

                  {/* Upcoming Meetings */}
                  {macro.nextFomcList && macro.nextFomcList.length > 1 && (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-sm font-semibold text-green-400 mb-3">
                        {lang === 'ar' ? 'الاجتماعات القادمة' : 'Upcoming Updates'}
                      </div>
                      <div className="space-y-2">
                        {macro.nextFomcList.slice(0, 3).map((meeting: any, index: number) => {
                          const startDate = new Date(meeting.start);
                          const endDate = new Date(meeting.end);
                          const daysUntil = calculateDaysUntil(meeting.end);
                          return (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">
                                  {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–
                                  {endDate.toLocaleDateString('en-US', { day: 'numeric' })}
                                </span>
                                {meeting.isSEP && (
                                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded">
                                    SEP
                                  </span>
                                )}
                              </div>
                              <span className="text-gray-400 text-xs">
                                {daysUntil >= 0 ? `${daysUntil}d` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 text-sm">
                  {lang === 'ar' ? 'جارٍ تحميل البيانات...' : 'Loading macro data...'}
                </div>
              )}
            </div>

            {/* Forecast Card */}
            {forecast && (
              <div className="mt-4 sm:mt-6">
                <ForecastCard 
                  forecast={forecast.forecast} 
                  insufficientData={forecast.insufficientData}
                  country="US"
                  title={lang === 'ar' ? 'التوقعات قصيرة المدى (الولايات المتحدة)' : 'Short-Term Outlook (US)'}
                />
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

export default function USPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <USPageContent />
    </Suspense>
  );
}

