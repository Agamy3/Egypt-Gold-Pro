'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import { computeGoldFromMoney, type MarketSnapshot } from '@/lib/calculator';
import { createClientSupabaseClient } from '@/lib/supabase/client-auth';

interface MoneyToGoldCalculatorProps {
  country: string;
  currency: string;
  snapshot: MarketSnapshot | null;
}

export default function MoneyToGoldCalculator({
  country,
  currency,
  snapshot,
}: MoneyToGoldCalculatorProps) {
  const { lang } = useLang();
  const [amount, setAmount] = useState<string>('');
  const [feesPct, setFeesPct] = useState<string>('0');
  const [debouncedAmount, setDebouncedAmount] = useState<string>('');
  const [debouncedFees, setDebouncedFees] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
        
        // Load saved preferences if authenticated
        if (session) {
          const { data } = await supabase
            .from('user_calculator_prefs')
            .select('last_amount, last_fees_pct')
            .eq('user_id', session.user.id)
            .single();
          
          if (data) {
            if (data.last_amount) {
              setAmount(data.last_amount.toString());
              setDebouncedAmount(data.last_amount.toString());
            }
            if (data.last_fees_pct !== null && data.last_fees_pct !== undefined) {
              setFeesPct(data.last_fees_pct.toString());
              setDebouncedFees(data.last_fees_pct.toString());
            }
          }
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      }
    };
    checkAuth();
  }, []);

  // Debounce amount input (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount);
    }, 200);
    return () => clearTimeout(timer);
  }, [amount]);

  // Debounce fees input (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFees(feesPct);
    }, 200);
    return () => clearTimeout(timer);
  }, [feesPct]);

  // Save preferences when amount or fees change (if authenticated)
  useEffect(() => {
    if (!isAuthenticated || !debouncedAmount) return;

    const savePrefs = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const amountNum = parseFloat(debouncedAmount);
        const feesNum = parseFloat(debouncedFees) || 0;

        if (isNaN(amountNum) || amountNum <= 0) return;

        await supabase
          .from('user_calculator_prefs')
          .upsert({
            user_id: session.user.id,
            last_amount: amountNum,
            last_fees_pct: feesNum,
          }, {
            onConflict: 'user_id',
          });
      } catch (err) {
        console.error('Error saving calculator prefs:', err);
      }
    };

    savePrefs();
  }, [debouncedAmount, debouncedFees, isAuthenticated]);

  // Calculate results
  const result = snapshot
    ? computeGoldFromMoney(
        parseFloat(debouncedAmount) || 0,
        snapshot,
        parseFloat(debouncedFees) || 0
      )
    : null;

  const formatGrams = (grams: number | null): string => {
    if (grams === null) return '-';
    return grams.toFixed(3);
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return '-';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getCurrencySymbol = () => {
    switch (currency) {
      case 'EGP': return 'E£';
      case 'USD': return '$';
      case 'AED': return 'AED';
      case 'SAR': return 'SAR';
      default: return currency;
    }
  };

  // If not authenticated, show benefits CTA
  if (!isAuthenticated) {
    return (
      <div className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8 border border-gold-600">
        <h2 className={`text-xl font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
          {lang === 'ar' ? 'حاسبة المال إلى الذهب' : 'Money → Gold Calculator'}
        </h2>
        
        <div className={`bg-gray-800 rounded-lg p-6 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
          <h3 className={`text-lg font-semibold text-gold-400 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? '🎯 مزايا الحساب المجاني' : '🎯 Free Account Benefits'}
          </h3>
          <ul className={`space-y-3 text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
            <li className="flex items-start gap-2">
              <span className="text-gold-400 mt-1">✓</span>
              <span>{lang === 'ar' ? 'حاسبة المال إلى الذهب - احسب كم جرام ذهب يمكنك شراؤه' : 'Money → Gold Calculator - Calculate how many grams of gold you can buy'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-400 mt-1">✓</span>
              <span>{lang === 'ar' ? 'محفظة الذهب - تتبع استثماراتك في الذهب' : 'Gold Portfolio - Track your gold investments'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-400 mt-1">✓</span>
              <span>{lang === 'ar' ? 'إشعارات الأسعار - تنبيهات عند تغيير الأسعار' : 'Price Notifications - Alerts when prices change'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-400 mt-1">✓</span>
              <span>{lang === 'ar' ? 'تخزين التفضيلات - احفظ إعداداتك عبر الأجهزة' : 'Save Preferences - Your settings sync across devices'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-400 mt-1">✓</span>
              <span>{lang === 'ar' ? 'ملخصات يومية وأسبوعية - رؤى السوق' : 'Daily & Weekly Summaries - Market insights'}</span>
            </li>
          </ul>
        </div>

        <div className={`flex gap-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/auth/signin"
            className="flex-1 px-6 py-3 bg-gold-600 hover:bg-gold-700 text-white font-semibold rounded-md text-center transition-colors"
          >
            {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </Link>
          <Link
            href="/auth/signup"
            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-md text-center transition-colors"
          >
            {lang === 'ar' ? 'إنشاء حساب' : 'Create Account'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8">
      <h2 className={`text-xl font-semibold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
        {lang === 'ar' ? 'حاسبة المال إلى الذهب' : 'Money → Gold Calculator'}
      </h2>

      <div className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className={`block text-sm font-medium text-gray-300 mb-2 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'المبلغ' : 'Amount'}
          </label>
          <div className="relative">
            <span className={`absolute ${lang === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400`}>
              {getCurrencySymbol()}
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={lang === 'ar' ? 'أدخل المبلغ' : 'Enter amount'}
              min="0"
              step="0.01"
              className={`w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 ${
                lang === 'ar' ? 'pr-12 text-right' : 'pl-12'
              } focus:outline-none focus:ring-2 focus:ring-gold-500`}
            />
          </div>
        </div>

        {/* Fees Input */}
        <div>
          <label className={`block text-sm font-medium text-gray-300 mb-2 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'رسوم إضافية (%)' : 'Include Fees (%)'} <span className="text-gray-500 text-xs">({lang === 'ar' ? 'اختياري' : 'optional'})</span>
          </label>
          <input
            type="number"
            value={feesPct}
            onChange={(e) => setFeesPct(e.target.value)}
            placeholder="0"
            min="0"
            max="100"
            step="0.1"
            className={`w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 ${
              lang === 'ar' ? 'text-right' : ''
            } focus:outline-none focus:ring-2 focus:ring-gold-500`}
          />
        </div>

        {/* Warning if using fallback */}
        {result?.usedFallback && (
          <div className="bg-yellow-900 bg-opacity-50 border border-yellow-600 text-yellow-200 px-4 py-3 rounded text-sm">
            {lang === 'ar' 
              ? '⚠️ استخدام القيمة العادلة المقدرة (السعر المحلي غير متاح)'
              : '⚠️ Using estimated fair value (local market price unavailable)'}
          </div>
        )}

        {/* Results Table */}
        {result && !result.referenceUnavailable && parseFloat(debouncedAmount) > 0 ? (
          <div className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className={`py-3 px-4 text-left text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {lang === 'ar' ? 'العيار' : 'Karat'}
                    </th>
                    <th className={`py-3 px-4 text-left text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {lang === 'ar' ? 'السعر/جرام' : 'Price/gram'}
                    </th>
                    <th className={`py-3 px-4 text-left text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {lang === 'ar' ? 'تحصل على (جرام)' : 'You get (grams)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-800">
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>24k</td>
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {getCurrencySymbol()}{formatPrice(result.price24)}
                    </td>
                    <td className={`py-3 px-4 text-gold-400 font-semibold ${lang === 'ar' ? 'text-right' : ''}`}>
                      {formatGrams(result.grams24)}g
                    </td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>21k</td>
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {getCurrencySymbol()}{formatPrice(result.price21)}
                    </td>
                    <td className={`py-3 px-4 text-gold-400 font-semibold ${lang === 'ar' ? 'text-right' : ''}`}>
                      {formatGrams(result.grams21)}g
                    </td>
                  </tr>
                  <tr>
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>18k</td>
                    <td className={`py-3 px-4 text-gray-200 ${lang === 'ar' ? 'text-right' : ''}`}>
                      {getCurrencySymbol()}{formatPrice(result.price18)}
                    </td>
                    <td className={`py-3 px-4 text-gold-400 font-semibold ${lang === 'ar' ? 'text-right' : ''}`}>
                      {formatGrams(result.grams18)}g
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : result?.referenceUnavailable ? (
          <div className="mt-6 bg-red-900 bg-opacity-50 border border-red-600 text-red-200 px-4 py-3 rounded text-sm">
            {lang === 'ar' ? '❌ المرجع غير متاح' : '❌ No reference available'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

