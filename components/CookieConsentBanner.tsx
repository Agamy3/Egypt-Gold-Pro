'use client';

import { useEffect, useState } from 'react';
import { useLang } from './LanguageProvider';
import Link from 'next/link';

type ConsentStatus = 'accepted' | 'rejected' | null;

export default function CookieConsentBanner() {
  const { lang } = useLang();
  const [consent, setConsent] = useState<ConsentStatus>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check for existing consent
    const cookieConsent = document.cookie
      .split('; ')
      .find((row) => row.startsWith('cookie_consent='))
      ?.split('=')[1] as ConsentStatus | undefined;

    const localStorageConsent = localStorage.getItem('cookie_consent') as ConsentStatus | null;

    const existingConsent = cookieConsent || localStorageConsent;

    if (existingConsent) {
      setConsent(existingConsent);
      setShowBanner(false);
    } else {
      setShowBanner(true);
    }
  }, []);

  const saveConsent = (status: 'accepted' | 'rejected') => {
    // Save to cookie (expires in 1 year)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `cookie_consent=${status}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;

    // Save to localStorage as backup
    localStorage.setItem('cookie_consent', status);

    setConsent(status);
    setShowBanner(false);

    // If accepted, load analytics (if any)
    if (status === 'accepted') {
      // Analytics loading would go here if implemented
      // Example: window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    }
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 shadow-lg p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 ${lang === 'ar' ? 'sm:flex-row-reverse' : ''}`}>
          <div className="flex-1">
            <h3 className={`text-sm font-semibold text-gray-100 mb-2 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'ملفات تعريف الارتباط' : 'Cookie Consent'}
            </h3>
            <p className={`text-xs sm:text-sm text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar'
                ? 'نستخدم ملفات تعريف الارتباط لتحسين تجربتك. من خلال المتابعة، فإنك توافق على استخدامنا لملفات تعريف الارتباط.'
                : 'We use cookies to enhance your experience. By continuing, you agree to our use of cookies.'}
              {' '}
              <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                {lang === 'ar' ? 'اعرف المزيد' : 'Learn more'}
              </Link>
            </p>
          </div>
          <div className={`flex gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => saveConsent('rejected')}
              className="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
            >
              {lang === 'ar' ? 'رفض' : 'Reject'}
            </button>
            <button
              onClick={() => saveConsent('accepted')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              {lang === 'ar' ? 'قبول' : 'Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

