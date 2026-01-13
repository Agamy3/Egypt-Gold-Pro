'use client';

import Link from 'next/link';
import { useLang } from './LanguageProvider';
import CookiePreferencesLink from './CookiePreferencesLink';

export default function Footer() {
  const { lang } = useLang();

  return (
    <footer className="bg-gray-900 border-t border-gray-800 mt-auto w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-6">
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${lang === 'ar' ? 'sm:flex-row-reverse' : ''}`}>
          <div className={`text-sm text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
            © {new Date().getFullYear()} EgyptGold Pro. {lang === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
          </div>
          <div className={`flex gap-4 items-center ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <Link
              href="/privacy"
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
            </Link>
            <Link
              href="/terms"
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              {lang === 'ar' ? 'شروط الخدمة' : 'Terms of Service'}
            </Link>
            <CookiePreferencesLink />
            <a
              href="mailto:support@egyptgoldpro.com"
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              {lang === 'ar' ? 'اتصل بنا' : 'Contact Us'}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

