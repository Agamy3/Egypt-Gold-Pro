/**
 * Premium Pricing Page
 * 
 * Shows premium features, coupon redemption, and request access form
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';

export default function PremiumPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [couponCode, setCouponCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(null);
  const [paying, setPaying] = useState<null | 'premium_monthly' | 'premium_yearly'>(null);
  const [payError, setPayError] = useState<string | null>(null);
  
  // Request access form
  const [requestEmail, setRequestEmail] = useState('');
  const [requestCountry, setRequestCountry] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestMessageState, setRequestMessageState] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check premium status
    fetch('/api/user/premium-status')
      .then(res => res.json())
      .then(data => {
        setIsPremium(data.status?.isPremium || false);
        setPremiumExpiresAt(data.status?.premiumExpiresAt || null);
      })
      .catch(() => setIsPremium(false));
    
    // Pre-fill email if logged in
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(data => {
        if (data.profile?.email) {
          setRequestEmail(data.profile.email);
        }
        if (data.profile?.preferred_country) {
          setRequestCountry(data.profile.preferred_country);
        }
      })
      .catch(() => {});
  }, []);

  const startPaymobCheckout = async (plan: 'premium_monthly' | 'premium_yearly') => {
    setPaying(plan);
    setPayError(null);
    try {
      const res = await fetch('/api/billing/paymob/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Checkout failed (${res.status})`);
      if (json?.merchant_order_id) {
        try {
          window.localStorage.setItem('egp_last_merchant_order_id', String(json.merchant_order_id));
        } catch {
          // ignore
        }
      }
      window.location.href = String(json.checkout_url);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Checkout failed');
      setPaying(null);
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) {
      setRedeemMessage({ type: 'error', text: lang === 'ar' ? 'يرجى إدخال كود القسيمة' : 'Please enter a coupon code' });
      return;
    }

    setRedeeming(true);
    setRedeemMessage(null);

    try {
      const response = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setRedeemMessage({ type: 'success', text: data.coupon?.description || (lang === 'ar' ? 'تم استبدال القسيمة بنجاح!' : 'Coupon redeemed successfully!') });
        setCouponCode('');
        // Refresh premium status
        fetch('/api/user/premium-status')
          .then(res => res.json())
          .then(data => {
            setIsPremium(data.status?.isPremium || false);
            setPremiumExpiresAt(data.status?.premiumExpiresAt || null);
          });
      } else {
        setRedeemMessage({ type: 'error', text: data.error || (lang === 'ar' ? 'فشل استبدال القسيمة' : 'Failed to redeem coupon') });
      }
    } catch (error) {
      setRedeemMessage({ type: 'error', text: lang === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى.' : 'An error occurred. Please try again.' });
    } finally {
      setRedeeming(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!requestEmail.trim()) {
      setRequestMessageState({ type: 'error', text: lang === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required' });
      return;
    }

    setSubmittingRequest(true);
    setRequestMessageState(null);

    try {
      const response = await fetch('/api/premium/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: requestEmail.trim(),
          country: requestCountry || null,
          message: requestMessage.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setRequestMessageState({ type: 'success', text: lang === 'ar' ? 'تم إرسال طلبك بنجاح. سنراجع طلبك قريباً.' : 'Request submitted successfully. We will review your request soon.' });
        setRequestEmail('');
        setRequestCountry('');
        setRequestMessage('');
      } else {
        setRequestMessageState({ type: 'error', text: data.error || (lang === 'ar' ? 'فشل إرسال الطلب' : 'Failed to submit request') });
      }
    } catch (error) {
      setRequestMessageState({ type: 'error', text: lang === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى.' : 'An error occurred. Please try again.' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold text-gold-400">EgyptGold Pro</span>
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            {lang === 'ar' ? 'ترقية إلى المميز' : 'Upgrade to Premium'}
          </h1>
          <p className="text-xl text-gray-400">
            {lang === 'ar' ? 'افتح الميزات المتقدمة والرؤى' : 'Unlock advanced features and insights'}
          </p>
        </div>

        {isPremium && (
          <div className="mb-8 p-6 bg-green-900/30 border border-green-700 rounded-lg">
            <p className="text-green-300 font-semibold">
              {lang === 'ar' ? 'أنت عضو مميز!' : 'You are a Premium member!'}
              {premiumExpiresAt && (
                <span className="text-sm text-gray-400 ml-2">
                  ({lang === 'ar' ? 'ينتهي في' : 'Expires'} {new Date(premiumExpiresAt).toLocaleDateString()})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Paymob checkout (EGP) */}
        {!isPremium && (
          <div className="max-w-3xl mx-auto mb-10 rounded-xl border border-gray-800 bg-gray-950 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{lang === 'ar' ? 'اشترك بريميوم' : 'Subscribe to Premium'}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {lang === 'ar'
                    ? 'ادفع بالبطاقة عبر Paymob وسيتم تفعيل بريميوم تلقائياً.'
                    : 'Pay by card via Paymob. Premium activates automatically after payment confirmation.'}
                </p>
              </div>
              <Link
                href="/premium/ar"
                className={`text-sm text-gold-400 hover:text-gold-300 ${lang === 'ar' ? 'hidden' : ''}`}
              >
                العربية
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void startPaymobCheckout('premium_monthly')}
                disabled={paying !== null}
                className="rounded-lg border border-gold-600 bg-gold-600/10 px-4 py-3 text-left text-white hover:bg-gold-600/20 disabled:opacity-60"
              >
                <div className="text-sm font-semibold">{lang === 'ar' ? 'شهري' : 'Monthly'}</div>
                <div className="mt-1 text-2xl font-bold">99 EGP</div>
              </button>
              <button
                onClick={() => void startPaymobCheckout('premium_yearly')}
                disabled={paying !== null}
                className="rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-3 text-left text-white hover:bg-gray-900 disabled:opacity-60"
              >
                <div className="text-sm font-semibold">{lang === 'ar' ? 'سنوي' : 'Yearly'}</div>
                <div className="mt-1 text-2xl font-bold">899 EGP</div>
              </button>
            </div>

            {payError && <div className="mt-3 text-sm text-red-300">{payError}</div>}
            {paying && <div className="mt-3 text-xs text-gray-500">{lang === 'ar' ? 'جارٍ فتح صفحة الدفع…' : 'Opening checkout…'}</div>}
          </div>
        )}

        {/* Premium Features */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">
            {lang === 'ar' ? 'ميزات المميز' : 'Premium Features'}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h3 className="text-lg font-semibold text-white mb-4">
                {lang === 'ar' ? 'مجاني' : 'Free'}
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li>✓ {lang === 'ar' ? 'بيانات السوق الأساسية' : 'Basic market data'}</li>
                <li>✓ {lang === 'ar' ? 'أخبار الذهب (أساسي)' : 'Gold news (basic)'}</li>
                <li>✓ {lang === 'ar' ? 'تتبع المحفظة' : 'Portfolio tracking'}</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-gold-900/30 to-gold-800/20 rounded-lg p-6 border-2 border-gold-500">
              <h3 className="text-lg font-semibold text-white mb-4">
                {lang === 'ar' ? 'مميز' : 'Premium'}
              </h3>
              <ul className="space-y-2 text-white">
                <li>✓ {lang === 'ar' ? 'كل ما في المجاني' : 'Everything in Free'}</li>
                <li>✓ {lang === 'ar' ? 'تجربة خالية من الإعلانات' : 'Ad-free experience'}</li>
                <li>✓ {lang === 'ar' ? 'إشارات الماكرو والذهب المتقدمة' : 'Advanced Macro & Gold Signals'}</li>
                <li>✓ {lang === 'ar' ? 'أخبار الذهب المميزة' : 'Premium Gold News'}</li>
                <li>✓ {lang === 'ar' ? 'الإشعارات المتقدمة' : 'Advanced notifications'}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Coupon Redemption */}
        {!isPremium && (
          <div className="max-w-2xl mx-auto bg-gray-900 rounded-lg shadow-md p-8 border border-gray-800 mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">
              {lang === 'ar' ? 'استبدال كود القسيمة' : 'Redeem Coupon Code'}
            </h2>
            <p className="text-gray-400 mb-6">
              {lang === 'ar' ? 'لديك كود قسيمة؟ أدخله أدناه لفتح الميزات المميزة.' : 'Have a coupon code? Enter it below to unlock premium features.'}
            </p>
            
            <div className="flex gap-4">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder={lang === 'ar' ? 'أدخل كود القسيمة' : 'Enter coupon code'}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                onKeyPress={(e) => e.key === 'Enter' && handleRedeemCoupon()}
              />
              <button
                onClick={handleRedeemCoupon}
                disabled={redeeming}
                className="px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeeming ? (lang === 'ar' ? 'جارٍ الاستبدال...' : 'Redeeming...') : (lang === 'ar' ? 'استبدال' : 'Redeem')}
              </button>
            </div>

            {redeemMessage && (
              <div className={`mt-4 p-4 rounded-md ${
                redeemMessage.type === 'success' 
                  ? 'bg-green-900/50 border border-green-700 text-green-300'
                  : 'bg-red-900/50 border border-red-700 text-red-300'
              }`}>
                {redeemMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Request Access Form */}
        {!isPremium && (
          <div className="max-w-2xl mx-auto bg-gray-900 rounded-lg shadow-md p-8 border border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-4">
              {lang === 'ar' ? 'طلب الوصول المميز' : 'Request Premium Access'}
            </h2>
            <p className="text-gray-400 mb-6">
              {lang === 'ar' ? 'لا تملك قسيمة؟ أرسل طلباً للحصول على وصول مميز.' : "Don't have a coupon? Submit a request for premium access."}
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}
                </label>
                <input
                  type="email"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'البلد' : 'Country'}
                </label>
                <select
                  value={requestCountry}
                  onChange={(e) => setRequestCountry(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                >
                  <option value="">{lang === 'ar' ? 'اختر البلد' : 'Select country'}</option>
                  <option value="EG">{lang === 'ar' ? 'مصر' : 'Egypt'}</option>
                  <option value="AE">{lang === 'ar' ? 'الإمارات' : 'UAE'}</option>
                  <option value="SA">{lang === 'ar' ? 'السعودية' : 'Saudi Arabia'}</option>
                  <option value="US">{lang === 'ar' ? 'الولايات المتحدة' : 'USA'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'رسالة (اختياري)' : 'Message (optional)'}
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  rows={4}
                />
              </div>
              <button
                onClick={handleRequestAccess}
                disabled={submittingRequest}
                className="w-full px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors disabled:opacity-50"
              >
                {submittingRequest ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'Submitting...') : (lang === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
              </button>
            </div>

            {requestMessageState && (
              <div className={`mt-4 p-4 rounded-md ${
                requestMessageState.type === 'success' 
                  ? 'bg-green-900/50 border border-green-700 text-green-300'
                  : 'bg-red-900/50 border border-red-700 text-red-300'
              }`}>
                {requestMessageState.text}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
