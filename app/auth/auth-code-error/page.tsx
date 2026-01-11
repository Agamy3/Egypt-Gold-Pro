'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider';

function AuthCodeErrorContent() {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const message = searchParams.get('message');

  const getErrorMessage = () => {
    if (message) {
      return decodeURIComponent(message);
    }
    if (error) {
      // Provide user-friendly error messages
      const errorMessages: Record<string, string> = {
        'access_denied': lang === 'ar' ? 'تم رفض الوصول. يرجى المحاولة مرة أخرى.' : 'Access denied. Please try again.',
        'invalid_request': lang === 'ar' ? 'طلب غير صالح. يرجى المحاولة مرة أخرى.' : 'Invalid request. Please try again.',
        'no_session': lang === 'ar' ? 'فشل إنشاء الجلسة. يرجى المحاولة مرة أخرى.' : 'Failed to create session. Please try again.',
      };
      return errorMessages[error] || error;
    }
    return lang === 'ar' 
      ? 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.'
      : 'An error occurred during authentication. Please try again.';
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800 text-center">
          <div className="text-red-400 text-5xl mb-4">✗</div>
          <h1 className={`text-2xl font-bold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'خطأ في المصادقة' : 'Authentication Error'}
          </h1>
          <p className="text-gray-400 mb-2">
            {getErrorMessage()}
          </p>
          {error && (
            <p className="text-gray-500 text-sm mb-6 mt-2">
              {lang === 'ar' ? 'رمز الخطأ:' : 'Error code:'} {error}
            </p>
          )}
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

export default function AuthCodeErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
        </div>
      </div>
    }>
      <AuthCodeErrorContent />
    </Suspense>
  );
}

