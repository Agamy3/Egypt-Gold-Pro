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
    const benefits = [
      {
        icon: '🧮',
        title: lang === 'ar' ? 'حاسبة المال إلى الذهب' : 'Money → Gold Calculator',
        description: lang === 'ar' ? 'احسب كم جرام ذهب يمكنك شراؤه بأي مبلغ' : 'Calculate how many grams of gold you can buy with any amount',
      },
      {
        icon: '💼',
        title: lang === 'ar' ? 'محفظة الذهب' : 'Gold Portfolio',
        description: lang === 'ar' ? 'تتبع استثماراتك في الذهب واحسب الأرباح والخسائر' : 'Track your gold investments and calculate profit/loss',
      },
      {
        icon: '🔔',
        title: lang === 'ar' ? 'إشعارات الأسعار' : 'Price Notifications',
        description: lang === 'ar' ? 'تنبيهات فورية عند تغيير أسعار الذهب' : 'Instant alerts when gold prices change',
      },
      {
        icon: '⚙️',
        title: lang === 'ar' ? 'تخزين التفضيلات' : 'Save Preferences',
        description: lang === 'ar' ? 'احفظ إعداداتك وتفضيلاتك عبر جميع الأجهزة' : 'Your settings and preferences sync across all devices',
      },
      {
        icon: '📊',
        title: lang === 'ar' ? 'ملخصات السوق' : 'Market Summaries',
        description: lang === 'ar' ? 'ملخصات يومية وأسبوعية مع رؤى السوق' : 'Daily & weekly summaries with market insights',
      },
    ];

    return (
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 rounded-lg shadow-lg p-6 sm:p-8 border border-gold-600/30 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gold-600/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className={`flex items-center gap-3 mb-6 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="w-12 h-12 bg-gold-600/20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">✨</span>
            </div>
            <div>
              <h2 className={`text-2xl font-bold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'انضم مجاناً واحصل على المزيد' : 'Join Free & Unlock More'}
              </h2>
              <p className={`text-sm text-gray-400 mt-1 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'إنشاء حساب مجاني - لا توجد بطاقات ائتمانية مطلوبة' : 'Create a free account - No credit card required'}
              </p>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className={`bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50 hover:border-gold-600/50 transition-all hover:shadow-lg ${lang === 'ar' ? 'text-right' : ''}`}
              >
                <div className={`flex items-start gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                  <div className="text-3xl flex-shrink-0">{benefit.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-100 mb-1 text-sm">
                      {benefit.title}
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className={`flex flex-col sm:flex-row gap-3 ${lang === 'ar' ? 'sm:flex-row-reverse' : ''}`}>
            <Link
              href="/auth/signup"
              className="flex-1 px-6 py-3.5 bg-gradient-to-r from-gold-600 to-gold-700 hover:from-gold-700 hover:to-gold-800 text-white font-semibold rounded-lg text-center transition-all shadow-lg hover:shadow-gold-600/50 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'إنشاء حساب مجاني' : 'Create Free Account'}</span>
              <span>→</span>
            </Link>
            <Link
              href="/auth/signin"
              className="flex-1 px-6 py-3.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg text-center transition-all border border-gray-700 hover:border-gray-600 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</span>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className={`mt-4 flex items-center justify-center gap-6 text-xs text-gray-500 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <div className="flex items-center gap-1.5">
              <span>🔒</span>
              <span>{lang === 'ar' ? 'آمن 100%' : '100% Secure'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>⚡</span>
              <span>{lang === 'ar' ? 'سريع وسهل' : 'Quick & Easy'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>🆓</span>
              <span>{lang === 'ar' ? 'مجاني دائماً' : 'Always Free'}</span>
            </div>
          </div>
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

