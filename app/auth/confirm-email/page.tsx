'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import { createClientSupabaseClient } from '@/lib/supabase/client-auth';

function ConfirmEmailContent() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    // Try to get email from URL params or localStorage
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
      try {
        localStorage.setItem('egp_signup_email', emailParam);
      } catch {
        // ignore
      }
    } else {
      // Try to get from localStorage
      try {
        const stored = localStorage.getItem('egp_signup_email');
        if (stored) setEmail(stored);
      } catch {
        // ignore
      }
    }
  }, [searchParams]);

  const handleResend = async () => {
    if (!email) {
      setResendError(lang === 'ar' ? 'البريد الإلكتروني غير متاح' : 'Email not available');
      return;
    }

    setResending(true);
    setResendError(null);
    setResendSuccess(false);

    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) {
        setResendError(error.message || (lang === 'ar' ? 'فشل إعادة الإرسال' : 'Failed to resend email'));
      } else {
        setResendSuccess(true);
        setTimeout(() => setResendSuccess(false), 5000);
      }
    } catch (err) {
      setResendError(err instanceof Error ? err.message : (lang === 'ar' ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800">
          {/* Logo/Title */}
          <div className={`text-center mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h1 className="text-2xl font-bold text-gold-600 mb-2">EgyptGold Pro</h1>
            <h2 className={`text-xl font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'تأكيد البريد الإلكتروني' : 'Confirm your email'}
            </h2>
          </div>

          {/* Main Message */}
          <div className={`mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
            <p className="text-gray-300 mb-4">
              {lang === 'ar'
                ? 'لقد أرسلنا رابط التأكيد إلى عنوان بريدك الإلكتروني.'
                : "We've sent a confirmation link to your email address."}
            </p>

            {email && (
              <div className="bg-gray-800 rounded-md p-3 mb-4">
                <p className="text-sm text-gray-400 mb-1">
                  {lang === 'ar' ? 'البريد الإلكتروني:' : 'Email:'}
                </p>
                <p className="text-gray-200 font-mono text-sm">{email}</p>
              </div>
            )}

            {/* Steps */}
            <div className="space-y-3 mt-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-600 text-black font-bold text-sm flex items-center justify-center">
                  1
                </div>
                <p className="text-gray-300 text-sm flex-1">
                  {lang === 'ar' ? 'افتح صندوق الوارد الخاص بك' : 'Check your inbox'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-600 text-black font-bold text-sm flex items-center justify-center">
                  2
                </div>
                <p className="text-gray-300 text-sm flex-1">
                  {lang === 'ar' ? 'انقر على رابط التأكيد في البريد الإلكتروني' : 'Click the confirmation link in the email'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-600 text-black font-bold text-sm flex items-center justify-center">
                  3
                </div>
                <p className="text-gray-300 text-sm flex-1">
                  {lang === 'ar' ? 'ارجع إلى تسجيل الدخول' : 'Return to login'}
                </p>
              </div>
            </div>
          </div>

          {/* Resend Success/Error */}
          {resendSuccess && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
              {lang === 'ar' ? 'تم إعادة إرسال البريد الإلكتروني بنجاح' : 'Email resent successfully'}
            </div>
          )}

          {resendError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {resendError}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={resending || !email}
              className="w-full py-2 bg-gold-600 hover:bg-gold-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
            >
              {resending
                ? lang === 'ar'
                  ? 'جاري الإرسال...'
                  : 'Sending...'
                : lang === 'ar'
                ? 'إعادة إرسال البريد الإلكتروني'
                : 'Resend email'}
            </button>

            <Link
              href="/auth/signin"
              className="block w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-md transition-colors text-center"
            >
              {lang === 'ar' ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}
            </Link>
          </div>

          {/* Help Text */}
          <div className={`mt-6 text-xs text-gray-500 text-center ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar'
              ? 'لم تستلم البريد الإلكتروني؟ تحقق من مجلد الرسائل غير المرغوب فيها أو جرب إعادة الإرسال.'
              : "Didn't receive the email? Check your spam folder or try resending."}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800 text-center">
            <p className="text-gray-300">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <ConfirmEmailContent />
    </Suspense>
  );
}
