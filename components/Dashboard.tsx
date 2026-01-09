'use client';

import HoverTip from './ui/HoverTip';
import { useLang } from './LanguageProvider';
import { t } from '@/lib/i18n';

interface DashboardProps {
  snapshot: {
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
        market24Buy: number | null;
      };
      sources: Array<{
        source: string;
        status: string;
        fetchedAt: number;
      }>;
      activeSourceCount: number;
    };
    country?: string;
    currency?: string;
    canonicalCurrency?: string;
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
  };
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

function getVarianceBadgeColor(classification: string): string {
  switch (classification) {
    case 'PREMIUM':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'DISCOUNT':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'FAIR':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export default function Dashboard({ snapshot }: DashboardProps) {
  const { lang } = useLang();
  
  return (
    <div className="space-y-6">
      {/* Warnings */}
      {snapshot.warnings.referenceUnavailable && (
        <div className="bg-red-900/30 border-2 border-red-700 rounded-lg p-4">
          <div className={`flex items-center ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <svg
              className={`h-5 w-5 text-red-600 ${lang === 'ar' ? 'ml-2' : 'mr-2'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className={`font-semibold text-red-300 ${lang === 'ar' ? 'text-right' : ''}`}>
              {t(lang, 'referenceUnavailable')}
            </span>
          </div>
          <p className={`mt-2 text-sm text-red-200 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'البيانات المطلوبة مفقودة. لا يمكن حساب القيمة العادلة أو الانحراف.' : 'Required data is missing. Cannot compute fair value or variance.'}
          </p>
        </div>
      )}

      {snapshot.warnings.fxUnavailable && !snapshot.warnings.referenceUnavailable && (
        <div className="bg-yellow-900/30 border-2 border-yellow-700 rounded-lg p-4">
          <div className={`flex items-center ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <svg
              className={`h-5 w-5 text-yellow-600 ${lang === 'ar' ? 'ml-2' : 'mr-2'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className={`font-semibold text-yellow-300 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'fxUnavailable')}</span>
          </div>
          <p className={`mt-2 text-sm text-yellow-200 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'سعر صرف الدولار/الجنيه غير متاح. تم تعطيل مقارنة القيمة العادلة.' : 'USD/EGP exchange rate is unavailable. Fair value comparison is disabled.'}
          </p>
        </div>
      )}

      {snapshot.warnings.lowConfidence && !snapshot.warnings.referenceUnavailable && (
        <div className="bg-yellow-900/30 border-2 border-yellow-700 rounded-lg p-4">
          <div className={`flex items-center ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <svg
              className={`h-5 w-5 text-yellow-600 ${lang === 'ar' ? 'ml-2' : 'mr-2'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className={`font-semibold text-yellow-300 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'lowConfidence')}</span>
          </div>
          <p className={`mt-2 text-sm text-yellow-200 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'مصدر واحد فقط متاح. قد تكون النتائج أقل دقة.' : 'Only one market source is available. Results may be less accurate.'}
          </p>
        </div>
      )}

      {/* Main Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Global Spot Gold Price */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gold-600`}>
          <HoverTip text={lang === 'ar' ? 'سعر الذهب العالمي الفوري لكل أونصة تروي (XAUUSD). يُستخدم كمرجع لحسابات القيمة العادلة.' : "Global spot gold price per troy ounce (XAUUSD). Used as the reference for fair-value calculations."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {t(lang, 'impliedOunce') || 'Global Spot Gold'}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          {snapshot.impliedOunce ? (
            <>
              <div className="text-3xl font-bold text-gold-700 mb-2">
                ${formatNumber(snapshot.impliedOunce.impliedOunceUsd, 2)}
              </div>
              <div className="text-sm text-gray-300">
                USD per troy ounce
              </div>
              <div className={`mt-4 flex items-center justify-between ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <span className="text-xs text-gray-500">
                  {t(lang, 'updated')}: {formatTimestamp(snapshot.impliedOunce.timestamp)}
                </span>
                {snapshot.impliedOunce.stale && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {t(lang, 'stale')}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* Market 21k */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-blue-600`}>
          <HoverTip text={lang === 'ar' ? 'الوسيط لأسعار شراء 21k المتاحة من المصادر النشطة.' : "Median of available 21k buy prices from active sources."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {t(lang, 'market21') || '21k Gold Price'}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          {snapshot.market.median.market21Buy !== null ? (
            <>
              <div className="text-3xl font-bold text-blue-700 mb-2">
                {formatNumber(snapshot.market.median.market21Buy, 0)} {snapshot.currency || 'EGP'}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                {t(lang, 'buyPrice')} ({snapshot.currency || 'EGP'})
              </div>
              <div className="mt-4 text-xs text-gray-500">
                {t(lang, 'sources')}: {snapshot.market.activeSourceCount}
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* Market 24k */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-purple-600`}>
          <HoverTip text={lang === 'ar' ? 'الوسيط لأسعار شراء 24k المتاحة من المصادر النشطة.' : "Median of available 24k buy prices from active sources."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {t(lang, 'market24') || '24k Gold Price'}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          {snapshot.market.median.market24Buy !== null ? (
            <>
              <div className="text-3xl font-bold text-purple-700 mb-2">
                {formatNumber(snapshot.market.median.market24Buy, 0)} {snapshot.currency || 'EGP'}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                {t(lang, 'buyPrice')} ({snapshot.currency || 'EGP'})
              </div>
              <div className="mt-4 text-xs text-gray-500">
                {t(lang, 'sources')}: {snapshot.market.activeSourceCount}
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* USD Exchange Rate */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-green-600`}>
          <HoverTip text={lang === 'ar' ? 'سعر الصرف الفوري للدولار المستخدم لتحويل أسعار الذهب العالمية إلى القيمة المحلية.' : "Live USD exchange rate used to convert global gold prices into local fair value."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {snapshot.canonicalCurrency === 'EGP' ? (t(lang, 'usdEgp') || 'USD/EGP') :
               snapshot.canonicalCurrency === 'AED' ? 'USD/AED' :
               snapshot.canonicalCurrency === 'SAR' ? 'USD/SAR' :
               'USD Rate'}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          {(() => {
            const rate = snapshot.canonicalCurrency === 'EGP' ? snapshot.pricing.fx?.usdEgp :
                         snapshot.canonicalCurrency === 'AED' ? snapshot.pricing.fx?.usdAed :
                         snapshot.canonicalCurrency === 'SAR' ? snapshot.pricing.fx?.usdSar :
                         snapshot.pricing.fx?.usdEgp;
            return rate !== null && rate !== undefined ? (
              <>
                <div className="text-3xl font-bold text-green-700 mb-2">
                  {formatNumber(rate, 2)}
                </div>
                <div className="text-sm text-gray-300">
                  {lang === 'ar' ? 'سعر صرف فعلي' : 'Real exchange rate'}
                </div>
                <div className={`mt-2 flex items-center justify-between ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  {snapshot.pricing.fx?.stale && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      {t(lang, 'stale')}
                    </span>
                  )}
                  {snapshot.pricing.fx?.fetchedAt && (
                    <span className="text-xs text-gray-500">
                      {t(lang, 'updated')}: {formatTimestamp(snapshot.pricing.fx.fetchedAt)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-gray-400">
                N/A (FX unavailable)
                {snapshot.pricing.fx?.error && (
                  <div className="text-xs text-red-500 mt-1">
                    {snapshot.pricing.fx.error}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Over/Under Pricing */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-indigo-600`}>
          <HoverTip text={lang === 'ar' ? 'الفرق بين وسيط السوق المحلي والقيمة العادلة المحسوبة. يوضح العلاوة/الخصم والتصنيف.' : "Difference between local market median and computed fair value. Shows premium/discount and classification."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {t(lang, 'marketVariance')}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          {snapshot.pricing.variance.classification !== 'N/A' ? (
            <>
              <div className={`inline-block px-4 py-2 rounded border-2 font-semibold mb-4 ${getVarianceBadgeColor(snapshot.pricing.variance.classification)}`}>
                {snapshot.pricing.variance.classification === 'PREMIUM' 
                  ? t(lang, 'premium')
                  : snapshot.pricing.variance.classification === 'DISCOUNT'
                  ? t(lang, 'discount')
                  : snapshot.pricing.variance.classification}
              </div>
              {snapshot.pricing.variance.variancePct !== null && (
                <div className="space-y-2">
                  <div>
                    <div className="text-sm text-gray-300">{t(lang, 'variance')}</div>
                    <div className="text-xl font-bold">
                      {snapshot.pricing.variance.variancePct > 0 ? '+' : ''}
                      {formatNumber(snapshot.pricing.variance.variancePct, 2)}%
                    </div>
                  </div>
                  {snapshot.pricing.variance.premiumEGP !== null && (
                    <div>
                      <div className="text-sm text-gray-300">
                        {snapshot.pricing.variance.premiumEGP > 0 ? t(lang, 'premium') : t(lang, 'discount')}
                      </div>
                      <div className="text-lg font-semibold">
                        {snapshot.pricing.variance.premiumEGP > 0 ? '+' : ''}
                        {formatNumber(snapshot.pricing.variance.premiumEGP, 2)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-400">
              {snapshot.warnings.fxUnavailable 
                ? (lang === 'ar' ? 'القيمة العادلة غير متاحة (يُطلب سعر الصرف)' : 'Fair value not available (FX required)')
                : (lang === 'ar' ? 'القيمة العادلة غير متاحة للمقارنة' : 'Fair value not available for comparison')}
            </div>
          )}
        </div>

        {/* Pricing Details */}
        <div className={`bg-gray-900 rounded-lg shadow-md p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-600`}>
          <HoverTip text={lang === 'ar' ? 'مقاييس التسعير المشتقة المحسوبة من سعر الذهب العالمي الفوري وسعر صرف الدولار/الجنيه.' : "Derived pricing metrics calculated from global gold spot price and USD/EGP exchange rate."}>
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              {t(lang, 'pricingDetails')}
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </h2>
          </HoverTip>
          <div className="space-y-3 text-sm">
            <div>
              <HoverTip text={lang === 'ar' ? 'مشتق من سعر الأونصة العالمية مقسومًا على 31.1035 جرام لكل أونصة تروي.' : "Derived from global ounce price divided by 31.1035 grams per troy ounce."}>
                <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  {t(lang, 'usdPerGram24')}
                  <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              </HoverTip>
              <div className="font-semibold">
                ${formatNumber(snapshot.pricing.usdPerGram24, 4)}
              </div>
            </div>
            <div>
              <HoverTip text={lang === 'ar' ? 'الدولار لكل جرام 24k معدل بنقاء 21/24.' : "24k USD/gram adjusted by 21/24 purity."}>
                <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  {t(lang, 'usdPerGram21')}
                  <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              </HoverTip>
              <div className="font-semibold">
                ${formatNumber(snapshot.pricing.usdPerGram21, 4)}
              </div>
            </div>
            {snapshot.pricing.fairValue.fair24 !== null && (
              <div className="pt-2 border-t border-gray-200">
                <HoverTip text={lang === 'ar' ? 'السعر المحلي المتوقع للـ 24k المستنتج من سعر الأونصة العالمية والدولار/الجنيه.' : "Expected local 24k price implied by global ounce price and USD/EGP."}>
                  <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                    {t(lang, 'fairValue24')}
                    <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                </HoverTip>
                <div className="font-semibold">
                      {formatNumber(snapshot.pricing.fairValue.fair24, 2)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                </div>
              </div>
            )}
            {snapshot.pricing.fairValue.fair21 !== null && (
              <div>
                <HoverTip text={lang === 'ar' ? 'السعر المحلي المتوقع للـ 21k المستنتج من سعر الأونصة العالمية والدولار/الجنيه.' : "Expected local 21k price implied by global ounce price and USD/EGP."}>
                  <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                    {t(lang, 'fairValue21')}
                    <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                </HoverTip>
                <div className="font-semibold">
                      {formatNumber(snapshot.pricing.fairValue.fair21, 2)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-400">
                {t(lang, 'lastUpdated')}: {formatTimestamp(snapshot.timestamp)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

