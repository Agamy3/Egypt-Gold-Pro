'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import HoverTip from './ui/HoverTip';
import { useLang } from './LanguageProvider';
import { t } from '@/lib/i18n';
import AdGateClient from './ads/AdGateClient';
import PremiumMacroPanel from './PremiumMacroPanel';
import SilverCard from './SilverCard';

interface DashboardProps {
  snapshot: {
    country?: string;
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
      activeUnderlyingSourceCount?: number;
      activeUnderlyingSources?: string[];
      sourcesUsed?: Record<string, string[]>;
    };
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
        premiumEGP?: number | null;
        premiumLocal?: number | null;
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

function getCountryName(country: string | undefined, lang: 'en' | 'ar'): string {
  const countryNames: Record<string, { en: string; ar: string }> = {
    EG: { en: 'Egypt', ar: 'مصر' },
    AE: { en: 'UAE', ar: 'الإمارات' },
    SA: { en: 'Saudi', ar: 'السعودية' },
    US: { en: 'USA', ar: 'الولايات المتحدة' },
  };
  return countryNames[country || 'EG']?.[lang] || countryNames.EG[lang];
}

function getCountryMarketLabel(country: string | undefined, karat: '18' | '21' | '24', lang: 'en' | 'ar'): string {
  const countryLabels: Record<string, Record<string, { en: string; ar: string }>> = {
    EG: {
      '18': { en: 'Egypt Market 18k (Median)', ar: 'سوق مصر ١٨ (وسيط)' },
      '21': { en: 'Egypt Market 21k (Median)', ar: 'سوق مصر ٢١ (وسيط)' },
      '24': { en: 'Egypt Market 24k (Median)', ar: 'سوق مصر ٢٤ (وسيط)' },
    },
    AE: {
      '18': { en: 'UAE Market 18k (Median)', ar: 'سوق الإمارات ١٨ (وسيط)' },
      '21': { en: 'UAE Market 21k (Median)', ar: 'سوق الإمارات ٢١ (وسيط)' },
      '24': { en: 'UAE Market 24k (Median)', ar: 'سوق الإمارات ٢٤ (وسيط)' },
    },
    SA: {
      '18': { en: 'Saudi Market 18k (Median)', ar: 'سوق السعودية ١٨ (وسيط)' },
      '21': { en: 'Saudi Market 21k (Median)', ar: 'سوق السعودية ٢١ (وسيط)' },
      '24': { en: 'Saudi Market 24k (Median)', ar: 'سوق السعودية ٢٤ (وسيط)' },
    },
    US: {
      '18': { en: 'USA Market 18k (Median)', ar: 'سوق الولايات المتحدة ١٨ (وسيط)' },
      '21': { en: 'USA Market 21k (Median)', ar: 'سوق الولايات المتحدة ٢١ (وسيط)' },
      '24': { en: 'USA Market 24k (Median)', ar: 'سوق الولايات المتحدة ٢٤ (وسيط)' },
    },
  };
  return countryLabels[country || 'EG']?.[karat]?.[lang] || countryLabels.EG[karat][lang];
}

export default function Dashboard({ snapshot }: DashboardProps) {
  const { lang } = useLang();
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const country = snapshot.country || 'EG';

  const dashboardContentSignals = [
    snapshot.market?.median?.market18Buy,
    snapshot.market?.median?.market21Buy,
    snapshot.market?.median?.market24Buy,
    snapshot.pricing?.usdPerGram24,
    snapshot.pricing?.usdPerGram21,
  ].filter((v) => typeof v === 'number' && v !== null && !Number.isNaN(v as number));

  const dashboardContentCount = dashboardContentSignals.length;

  useEffect(() => {
    // Check premium status
    fetch('/api/user/premium-status')
      .then(res => res.json())
      .then(data => {
        setIsPremium(data.status?.isPremium || false);
      })
      .catch(() => setIsPremium(false));
  }, []);
  
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Warnings */}
      {snapshot.warnings.referenceUnavailable && (
        <div className="bg-red-900/30 border-2 border-red-700 rounded-lg p-3 sm:p-4">
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
        <div className="bg-yellow-900/30 border-2 border-yellow-700 rounded-lg p-3 sm:p-4">
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
            {(() => {
              const currencyLabel = snapshot.canonicalCurrency === 'EGP' ? 'USD/EGP' :
                                   snapshot.canonicalCurrency === 'AED' ? 'USD/AED' :
                                   snapshot.canonicalCurrency === 'SAR' ? 'USD/SAR' :
                                   'USD';
              return lang === 'ar' 
                ? `سعر الصرف ${currencyLabel} غير متاح. تم تعطيل مقارنة القيمة العادلة.`
                : `${currencyLabel} exchange rate is unavailable. Fair value comparison is disabled.`;
            })()}
          </p>
        </div>
      )}


      {/* Main Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* 1. Global Spot Gold Price */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gold-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {lang === 'ar' ? 'السعر الفوري العالمي للذهب' : 'Global Spot Gold (USD)'}
            <HoverTip text={lang === 'ar' ? 'سعر الذهب العالمي الفوري لكل أونصة تروي (XAUUSD). يُستخدم كمرجع لحسابات القيمة العادلة.' : "Global spot gold price per troy ounce (XAUUSD). Used as the reference for fair-value calculations."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
          {snapshot.impliedOunce ? (
            <>
              <HoverTip 
                text={`${lang === 'ar' ? 'السعر الفوري العالمي للذهب المستند على بيانات موثوقة. آخر تحديث' : 'Global spot gold price based on reliable data. Last updated'}: ${formatTimestamp(snapshot.impliedOunce.timestamp)}${snapshot.impliedOunce.stale ? ` (${lang === 'ar' ? 'قديم' : 'stale'})` : ''}`}
              >
                <div className="text-2xl sm:text-3xl font-bold text-gold-700 mb-2 cursor-help touch-manipulation">
                  ${formatNumber(snapshot.impliedOunce.impliedOunceUsd, 2)}
                </div>
              </HoverTip>
              <div className="text-sm text-gray-300">
                USD per troy ounce
              </div>
              {snapshot.impliedOunce.stale && (
                <div className={`mt-2 ${lang === 'ar' ? 'text-right' : ''}`}>
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {t(lang, 'stale')}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* 2. Market 24k */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-purple-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {getCountryMarketLabel(snapshot.country, '24', lang)}
            <HoverTip text={lang === 'ar' ? 'الوسيط لأسعار شراء 24k المتاحة من المصادر النشطة.' : "Median of available 24k buy prices from active sources."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
          {snapshot.market.median.market24Buy !== null ? (
            <>
              <HoverTip 
                text={(() => {
                  const sourceCount = snapshot.market.activeSourceCount || 0;
                  const lastSource = snapshot.market.sources?.find(s => s.status === 'OK') || snapshot.market.sources?.[0];
                  const lastUpdated = lastSource?.fetchedAt 
                    ? formatTimestamp(lastSource.fetchedAt)
                    : formatTimestamp(snapshot.timestamp);
                  const minutesAgo = lastSource?.fetchedAt 
                    ? Math.floor((Date.now() - lastSource.fetchedAt) / 60000)
                    : Math.floor((Date.now() - snapshot.timestamp) / 60000);
                  const timeAgo = minutesAgo < 1 
                    ? (lang === 'ar' ? 'الآن' : 'just now')
                    : minutesAgo < 60
                    ? `${minutesAgo} ${lang === 'ar' ? 'دقيقة' : minutesAgo === 1 ? 'minute' : 'minutes'} ${lang === 'ar' ? 'مضت' : 'ago'}`
                    : `${Math.floor(minutesAgo / 60)} ${lang === 'ar' ? 'ساعة' : Math.floor(minutesAgo / 60) === 1 ? 'hour' : 'hours'} ${lang === 'ar' ? 'مضت' : 'ago'}`;
                  return `${lang === 'ar' ? 'سعر الوسيط المستند على' : 'Median price based on'} ${sourceCount} ${lang === 'ar' ? 'مصدر نشط' : sourceCount === 1 ? 'active source' : 'active sources'}. ${lang === 'ar' ? 'آخر تحديث' : 'Updated'} ${timeAgo}.`;
                })()}
              >
                <div className="text-2xl sm:text-3xl font-bold text-purple-700 mb-2 cursor-help touch-manipulation">
                  {formatNumber(snapshot.market.median.market24Buy, 0)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                </div>
              </HoverTip>
              <div className="text-sm text-gray-600 mb-4">
                {t(lang, 'buyPrice')} ({snapshot.currency || snapshot.canonicalCurrency || 'EGP'})
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* 3. Market 21k */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-blue-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {getCountryMarketLabel(snapshot.country, '21', lang)}
            <HoverTip text={lang === 'ar' ? 'الوسيط لأسعار شراء 21k المتاحة من المصادر النشطة.' : "Median of available 21k buy prices from active sources."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
          {snapshot.market.median.market21Buy !== null ? (
            <>
              <HoverTip 
                text={(() => {
                  const sourceCount = snapshot.market.activeSourceCount || 0;
                  const lastSource = snapshot.market.sources?.find(s => s.status === 'OK') || snapshot.market.sources?.[0];
                  const lastUpdated = lastSource?.fetchedAt 
                    ? formatTimestamp(lastSource.fetchedAt)
                    : formatTimestamp(snapshot.timestamp);
                  const minutesAgo = lastSource?.fetchedAt 
                    ? Math.floor((Date.now() - lastSource.fetchedAt) / 60000)
                    : Math.floor((Date.now() - snapshot.timestamp) / 60000);
                  const timeAgo = minutesAgo < 1 
                    ? (lang === 'ar' ? 'الآن' : 'just now')
                    : minutesAgo < 60
                    ? `${minutesAgo} ${lang === 'ar' ? 'دقيقة' : minutesAgo === 1 ? 'minute' : 'minutes'} ${lang === 'ar' ? 'مضت' : 'ago'}`
                    : `${Math.floor(minutesAgo / 60)} ${lang === 'ar' ? 'ساعة' : Math.floor(minutesAgo / 60) === 1 ? 'hour' : 'hours'} ${lang === 'ar' ? 'مضت' : 'ago'}`;
                  return `${lang === 'ar' ? 'سعر الوسيط المستند على' : 'Median price based on'} ${sourceCount} ${lang === 'ar' ? 'مصدر نشط' : sourceCount === 1 ? 'active source' : 'active sources'}. ${lang === 'ar' ? 'آخر تحديث' : 'Updated'} ${timeAgo}.`;
                })()}
              >
                <div className="text-2xl sm:text-3xl font-bold text-blue-700 mb-2 cursor-help touch-manipulation">
                  {formatNumber(snapshot.market.median.market21Buy, 0)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                </div>
              </HoverTip>
              <div className="text-sm text-gray-600 mb-4">
                {t(lang, 'buyPrice')} ({snapshot.currency || snapshot.canonicalCurrency || 'EGP'})
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* 4. Market 18k */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-cyan-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {getCountryMarketLabel(snapshot.country, '18', lang)}
            <HoverTip text={lang === 'ar' ? 'الوسيط لأسعار شراء 18k المتاحة من المصادر النشطة.' : "Median of available 18k buy prices from active sources."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
          {snapshot.market.median.market18Buy !== null && snapshot.market.median.market18Buy !== undefined ? (
            <>
              <HoverTip 
                text={(() => {
                  const sourceCount = snapshot.market.activeSourceCount || 0;
                  const lastSource = snapshot.market.sources?.find(s => s.status === 'OK') || snapshot.market.sources?.[0];
                  const lastUpdated = lastSource?.fetchedAt 
                    ? formatTimestamp(lastSource.fetchedAt)
                    : formatTimestamp(snapshot.timestamp);
                  const minutesAgo = lastSource?.fetchedAt 
                    ? Math.floor((Date.now() - lastSource.fetchedAt) / 60000)
                    : Math.floor((Date.now() - snapshot.timestamp) / 60000);
                  const timeAgo = minutesAgo < 1 
                    ? (lang === 'ar' ? 'الآن' : 'just now')
                    : minutesAgo < 60
                    ? `${minutesAgo} ${lang === 'ar' ? 'دقيقة' : minutesAgo === 1 ? 'minute' : 'minutes'} ${lang === 'ar' ? 'مضت' : 'ago'}`
                    : `${Math.floor(minutesAgo / 60)} ${lang === 'ar' ? 'ساعة' : Math.floor(minutesAgo / 60) === 1 ? 'hour' : 'hours'} ${lang === 'ar' ? 'مضت' : 'ago'}`;
                  return `${lang === 'ar' ? 'سعر الوسيط المستند على' : 'Median price based on'} ${sourceCount} ${lang === 'ar' ? 'مصدر نشط' : sourceCount === 1 ? 'active source' : 'active sources'}. ${lang === 'ar' ? 'آخر تحديث' : 'Updated'} ${timeAgo}.`;
                })()}
              >
                <div className="text-2xl sm:text-3xl font-bold text-cyan-700 mb-2 cursor-help touch-manipulation">
                  {formatNumber(snapshot.market.median.market18Buy, 0)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                </div>
              </HoverTip>
              <div className="text-sm text-gray-600 mb-4">
                {t(lang, 'buyPrice')} ({snapshot.currency || snapshot.canonicalCurrency || 'EGP'})
              </div>
            </>
          ) : (
            <div className="text-red-400 font-semibold">{t(lang, 'referenceUnavailable')}</div>
          )}
        </div>

        {/* 5. USD Exchange Rate */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-green-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {(() => {
              // Always use selected currency (not canonical currency) to show the rate the user wants to see
              const displayCurrency = snapshot.currency || 
                                    (snapshot.country === 'EG' ? 'EGP' :
                                     snapshot.country === 'AE' ? 'AED' :
                                     snapshot.country === 'SA' ? 'SAR' :
                                     snapshot.country === 'US' ? 'USD' : 'EGP');
              return displayCurrency === 'EGP' ? (t(lang, 'usdEgp') || 'USD/EGP') :
                     displayCurrency === 'AED' ? 'USD/AED' :
                     displayCurrency === 'SAR' ? 'USD/SAR' :
                     displayCurrency === 'USD' ? 'USD/USD' :
                     'USD Rate';
            })()}
            <HoverTip text={lang === 'ar' ? 'سعر الصرف الفوري للدولار المستخدم لتحويل أسعار الذهب العالمية إلى القيمة المحلية.' : "Live USD exchange rate used to convert global gold prices into local fair value."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
          {(() => {
            // Always use selected currency to determine which rate to show
            const displayCurrency = snapshot.currency || 
                                  (snapshot.country === 'EG' ? 'EGP' :
                                   snapshot.country === 'AE' ? 'AED' :
                                   snapshot.country === 'SA' ? 'SAR' :
                                   snapshot.country === 'US' ? 'USD' : 'EGP');
            
            // Get the rate based on the selected currency
            let rate: number | null | undefined;
            if (displayCurrency === 'EGP') {
              rate = snapshot.pricing.fx?.usdEgp;
            } else if (displayCurrency === 'AED') {
              rate = snapshot.pricing.fx?.usdAed;
            } else if (displayCurrency === 'SAR') {
              rate = snapshot.pricing.fx?.usdSar;
            } else if (displayCurrency === 'USD') {
              rate = 1.0; // USD to USD is always 1.0
            } else {
              // Fallback to EGP rate if currency is unknown
              rate = snapshot.pricing.fx?.usdEgp;
            }
            
            // Validate rate exists and is a valid number
            if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
              return (
                <div className="text-gray-400">
                  {lang === 'ar' ? 'غير متاح' : 'N/A'} ({lang === 'ar' ? 'سعر الصرف غير متاح' : 'FX unavailable'})
                  {snapshot.pricing.fx?.error && (
                    <div className="text-xs text-red-500 mt-1">
                      {snapshot.pricing.fx.error}
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <>
                <HoverTip 
                  text={`${lang === 'ar' ? 'سعر صرف فوري مستند على بيانات موثوقة' : 'Live exchange rate based on reliable data'}${snapshot.pricing.fx?.fetchedAt ? `. ${lang === 'ar' ? 'آخر تحديث' : 'Last updated'}: ${formatTimestamp(snapshot.pricing.fx.fetchedAt)}` : ''}${snapshot.pricing.fx?.stale ? ` (${lang === 'ar' ? 'قديم' : 'stale'})` : ''}`}
                >
                  <div className="text-2xl sm:text-3xl font-bold text-green-700 mb-2 cursor-help touch-manipulation">
                    {formatNumber(rate, 2)}
                  </div>
                </HoverTip>
                <div className="text-sm text-gray-300">
                  {lang === 'ar' ? 'سعر صرف فعلي' : 'Real exchange rate'}
                </div>
                {snapshot.pricing.fx?.stale && (
                  <div className={`mt-2 ${lang === 'ar' ? 'text-right' : ''}`}>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      {t(lang, 'stale')}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* 6. Over/Under Pricing (Market Variance) */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-indigo-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {t(lang, 'marketVariance')}
            <HoverTip text={lang === 'ar' ? 'الفرق بين وسيط السوق المحلي والقيمة العادلة المحسوبة. يوضح العلاوة/الخصم والتصنيف.' : "Difference between local market median and computed fair value. Shows premium/discount and classification."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
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
                  {(snapshot.pricing.variance.premiumEGP !== null || (snapshot.pricing.variance as any).premiumLocal !== null) && (
                    <div>
                      <div className="text-sm text-gray-300">
                        {((snapshot.pricing.variance.premiumEGP ?? (snapshot.pricing.variance as any).premiumLocal ?? 0) > 0) ? t(lang, 'premium') : t(lang, 'discount')}
                      </div>
                      <div className="text-lg font-semibold">
                        {((snapshot.pricing.variance.premiumEGP ?? (snapshot.pricing.variance as any).premiumLocal ?? 0) > 0) ? '+' : ''}
                        {formatNumber(snapshot.pricing.variance.premiumEGP ?? (snapshot.pricing.variance as any).premiumLocal ?? 0, 2)} {snapshot.currency || snapshot.canonicalCurrency || 'EGP'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-400">
              {snapshot.warnings.fxUnavailable 
                ? (lang === 'ar' ? 'القيمة العادلة غير متاحة (يُطلب سعر الصرف)' : 'Fair value not available (FX rate required)')
                : (lang === 'ar' ? 'القيمة العادلة غير متاحة للمقارنة' : 'Fair value not available for comparison')}
            </div>
          )}
        </div>

        {/* Premium CTA - Always visible for non-premium users */}
        {!isPremium && (
          <>
            {country === 'US' ? (
              <PremiumMacroPanel isPremium={false} lang={lang} />
            ) : (
              <div className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-700`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-lg font-semibold text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'ترقية إلى مميز' : 'Upgrade to Premium'}
                  </h2>
                </div>
                <p className="text-gray-500 mb-4 text-sm">
                  {lang === 'ar' 
                    ? 'افهم سبب تحرك الذهب - وليس فقط السعر.'
                    : 'Understand why gold moves — not just the price.'}
                </p>
                <Link
                  href="/premium"
                  className="inline-flex items-center px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors"
                >
                  {lang === 'ar' ? 'ترقية إلى مميز' : 'Upgrade to Premium'}
                </Link>
              </div>
            )}
          </>
        )}
        {isPremium && country === 'US' && (
          <PremiumMacroPanel isPremium={true} lang={lang} />
        )}

        {/* 7. Pricing Details */}
        <div 
          className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-600`}
        >
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {t(lang, 'pricingDetails')}
            <HoverTip text={(() => {
              const currencyLabel = snapshot.canonicalCurrency === 'EGP' ? 'USD/EGP' :
                                   snapshot.canonicalCurrency === 'AED' ? 'USD/AED' :
                                   snapshot.canonicalCurrency === 'SAR' ? 'USD/SAR' :
                                   'USD';
              return lang === 'ar' 
                ? `مقاييس التسعير المشتقة المحسوبة من سعر الذهب العالمي الفوري وسعر صرف ${currencyLabel}.`
                : `Derived pricing metrics calculated from global gold spot price and ${currencyLabel} exchange rate.`;
            })()}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h2>
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
                <HoverTip text={(() => {
                  const currencyLabel = snapshot.canonicalCurrency === 'EGP' ? 'USD/EGP' :
                                       snapshot.canonicalCurrency === 'AED' ? 'USD/AED' :
                                       snapshot.canonicalCurrency === 'SAR' ? 'USD/SAR' :
                                       'USD';
                  return lang === 'ar' 
                    ? `السعر المحلي المتوقع للـ 24k المستنتج من سعر الأونصة العالمية وسعر صرف ${currencyLabel}.`
                    : `Expected local 24k price implied by global ounce price and ${currencyLabel}.`;
                })()}>
                  <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                    {(() => {
                      const currency = snapshot.currency || snapshot.canonicalCurrency || 'EGP';
                      return lang === 'ar' 
                        ? `القيمة العادلة (٢٤ ${currency})`
                        : `Fair value (24k ${currency})`;
                    })()}
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
                <HoverTip text={(() => {
                  const currencyLabel = snapshot.canonicalCurrency === 'EGP' ? 'USD/EGP' :
                                       snapshot.canonicalCurrency === 'AED' ? 'USD/AED' :
                                       snapshot.canonicalCurrency === 'SAR' ? 'USD/SAR' :
                                       'USD';
                  return lang === 'ar' 
                    ? `السعر المحلي المتوقع للـ 21k المستنتج من سعر الأونصة العالمية وسعر صرف ${currencyLabel}.`
                    : `Expected local 21k price implied by global ounce price and ${currencyLabel}.`;
                })()}>
                  <div className={`text-gray-600 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                    {(() => {
                      const currency = snapshot.currency || snapshot.canonicalCurrency || 'EGP';
                      return lang === 'ar' 
                        ? `القيمة العادلة (٢١ ${currency})`
                        : `Fair value (21k ${currency})`;
                    })()}
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

        {/* 8. Silver (Premium-only) */}
        <SilverCard isPremium={isPremium} lang={lang} country={country as any} />
      </div>
      {/* Dashboard Ad - only when enough content is available and user is non-premium */}
    </div>
  );
}


