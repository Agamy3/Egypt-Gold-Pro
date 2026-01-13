/**
 * Premium Pricing Page - Arabic Version
 * 
 * Arabic content page (not machine translation)
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';

export default function PremiumArPage() {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user is premium
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(data => {
        setIsPremium(data.profile?.is_premium || false);
      })
      .catch(() => setIsPremium(false));
  }, []);

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) {
      setRedeemMessage({ type: 'error', text: 'يرجى إدخال كود القسيمة' });
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

      if (response.ok && data.success) {
        setRedeemMessage({ type: 'success', text: data.message || 'تم استبدال القسيمة بنجاح!' });
        setCouponCode('');
        // Refresh user status
        fetch('/api/user/profile')
          .then(res => res.json())
          .then(data => {
            setIsPremium(data.profile?.is_premium || false);
          });
      } else {
        setRedeemMessage({ type: 'error', text: data.error || 'فشل استبدال القسيمة' });
      }
    } catch (error) {
      setRedeemMessage({ type: 'error', text: 'حدث خطأ. يرجى المحاولة مرة أخرى.' });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen bg-black" dir="rtl">
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
          <h1 className="text-4xl font-bold text-white mb-4">ترقية إلى المميز</h1>
          <p className="text-xl text-gray-400">افتح الميزات المتقدمة والرؤى</p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          {/* Free Plan */}
          <div className="bg-gray-900 rounded-lg shadow-md p-8 border border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-4">مجاني</h2>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-gray-400">/شهر</span>
            </div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-green-400 ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-300">بيانات السوق الأساسية</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-green-400 ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-300">أخبار الذهب (أساسي)</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-green-400 ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-300">تتبع المحفظة</span>
              </li>
            </ul>
            {isPremium === false && (
              <button
                disabled
                className="w-full py-2 px-4 bg-gray-800 text-gray-400 rounded-md cursor-not-allowed"
              >
                الخطة الحالية
              </button>
            )}
          </div>

          {/* Premium Plan */}
          <div className="bg-gradient-to-br from-gold-600 to-gold-800 rounded-lg shadow-md p-8 border-2 border-gold-500 relative">
            {isPremium && (
              <div className="absolute top-4 left-4 bg-white text-gold-800 px-3 py-1 rounded-full text-sm font-semibold">
                نشط
              </div>
            )}
            <h2 className="text-2xl font-bold text-white mb-4">مميز</h2>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">قريباً</span>
            </div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-white ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-white">كل ما في المجاني</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-white ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-white">تجربة خالية من الإعلانات</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-white ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-white">إشارات الماكرو والذهب المتقدمة</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-white ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-white">أخبار الذهب المميزة (مزيد من العناصر + فلاتر)</span>
              </li>
              <li className="flex items-start flex-row-reverse">
                <svg className="w-5 h-5 text-white ml-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-white">الإشعارات المتقدمة (قريباً)</span>
              </li>
            </ul>
            {isPremium ? (
              <button
                disabled
                className="w-full py-2 px-4 bg-white text-gold-800 rounded-md font-semibold cursor-not-allowed"
              >
                المميز نشط
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2 px-4 bg-white text-gold-800 rounded-md font-semibold opacity-50 cursor-not-allowed"
              >
                قريباً
              </button>
            )}
          </div>
        </div>

        {/* Coupon Redemption */}
        <div className="max-w-2xl mx-auto bg-gray-900 rounded-lg shadow-md p-8 border border-gray-800">
          <h2 className="text-2xl font-bold text-white mb-4">استبدال كود القسيمة</h2>
          <p className="text-gray-400 mb-6">لديك كود قسيمة؟ أدخله أدناه لفتح الميزات المميزة.</p>
          
          <div className="flex gap-4 flex-row-reverse">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="أدخل كود القسيمة"
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500 text-right"
              onKeyPress={(e) => e.key === 'Enter' && handleRedeemCoupon()}
            />
            <button
              onClick={handleRedeemCoupon}
              disabled={redeeming}
              className="px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redeeming ? 'جارٍ الاستبدال...' : 'استبدال'}
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
      </main>

      <Footer />
    </div>
  );
}

