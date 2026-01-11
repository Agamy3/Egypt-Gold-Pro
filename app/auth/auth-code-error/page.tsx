'use client';

import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';

export default function AuthCodeErrorPage() {
  const { lang } = useLang();

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800 text-center">
          <div className="text-red-400 text-5xl mb-4">✗</div>
          <h1 className={`text-2xl font-bold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'خطأ في المصادقة' : 'Authentication Error'}
          </h1>
          <p className="text-gray-400 mb-6">
            {lang === 'ar' 
              ? 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.'
              : 'An error occurred during authentication. Please try again.'}
          </p>
          <Link
            href="/auth/signin"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
          >
            {lang === 'ar' ? 'العودة إلى تسجيل الدخول' : 'Back to Sign In'}
          </Link>
        </div>
      </div>
    </div>
  );
}

