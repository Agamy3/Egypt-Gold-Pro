'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';

export default function ConfirmedPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800 text-center">
          {/* Success Icon */}
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-900/30 border-2 border-green-600 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className={`text-2xl font-bold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'تم تأكيد البريد الإلكتروني بنجاح!' : 'Email confirmed successfully!'}
          </h1>

          {/* Message */}
          <p className={`text-gray-300 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar'
              ? 'يمكنك الآن تسجيل الدخول والبدء في استخدام EgyptGold Pro.'
              : 'You can now sign in and start using EgyptGold Pro.'}
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/"
              className="block w-full py-2 bg-gold-600 hover:bg-gold-700 text-white font-medium rounded-md transition-colors"
            >
              {lang === 'ar' ? 'الذهاب إلى لوحة التحكم' : 'Go to Dashboard'}
            </Link>

            <Link
              href="/auth/signin"
              className="block w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-md transition-colors"
            >
              {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
            </Link>
          </div>

          {/* Auto-redirect notice */}
          {countdown > 0 && (
            <p className={`mt-4 text-xs text-gray-500 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar'
                ? `سيتم التوجيه تلقائياً خلال ${countdown} ثانية...`
                : `Redirecting automatically in ${countdown} seconds...`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
