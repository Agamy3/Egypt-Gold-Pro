'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider';
import { createClientSupabaseClient } from '@/lib/supabase/client-auth';

function ResetPasswordContent() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasToken = searchParams.get('token');

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send reset email');
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClientSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (hasToken) {
    // Password update form
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800">
            <h1 className={`text-2xl font-bold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
            </h1>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
                {lang === 'ar' ? 'تم تحديث كلمة المرور بنجاح!' : 'Password updated successfully!'}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium text-gray-300 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>
                  {lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-md transition-colors"
              >
                {loading ? (lang === 'ar' ? 'جاري التحديث...' : 'Updating...') : (lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Request reset form
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-800">
          <h1 className={`text-2xl font-bold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
              {lang === 'ar' 
                ? 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني.' 
                : 'Password reset email sent. Please check your inbox.'}
            </div>
          )}

          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium text-gray-300 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-md transition-colors"
            >
              {loading ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (lang === 'ar' ? 'إرسال رابط إعادة التعيين' : 'Send Reset Link')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

