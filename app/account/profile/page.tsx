'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLang } from '@/components/LanguageProvider';
import AccountMenu from '@/components/AccountMenu';
import LanguageToggle from '@/components/LanguageToggle';
import CountryCurrencySelector from '@/components/CountryCurrencySelector';
import Footer from '@/components/Footer';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';
type Language = 'EN' | 'AR';

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  preferred_country: Country | null;
  preferred_currency: Currency | null;
  preferred_language: Language | null;
  email_notifications_enabled: boolean;
  app_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ProfileData {
  profile: UserProfile | null;
  email: string;
  provider: string;
  created_at: string;
}

export default function ProfilePage() {
  const { lang, setLang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    display_name: '',
    preferred_country: '' as Country | '',
    preferred_currency: '' as Currency | '',
    preferred_language: '' as Language | '',
    email_notifications_enabled: true,
    app_notifications_enabled: false,
  });

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profile', {
        cache: 'no-store',
      });

      if (res.status === 401) {
        router.push('/auth/signin');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load profile');
        return;
      }

      const data: ProfileData = await res.json();
      setProfileData(data);

      // Populate form with existing data
      if (data.profile) {
        setFormData({
          display_name: data.profile.display_name || '',
          preferred_country: data.profile.preferred_country || '',
          preferred_currency: data.profile.preferred_currency || '',
          preferred_language: data.profile.preferred_language || '',
          email_notifications_enabled: data.profile.email_notifications_enabled ?? true,
          app_notifications_enabled: data.profile.app_notifications_enabled ?? false,
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const payload: any = {};
      if (formData.display_name !== (profileData?.profile?.display_name || '')) {
        payload.display_name = formData.display_name || null;
      }
      if (formData.preferred_country !== (profileData?.profile?.preferred_country || '')) {
        payload.preferred_country = formData.preferred_country || null;
      }
      if (formData.preferred_currency !== (profileData?.profile?.preferred_currency || '')) {
        payload.preferred_currency = formData.preferred_currency || null;
      }
      if (formData.preferred_language !== (profileData?.profile?.preferred_language || '')) {
        payload.preferred_language = formData.preferred_language || null;
      }
      if (formData.email_notifications_enabled !== (profileData?.profile?.email_notifications_enabled ?? true)) {
        payload.email_notifications_enabled = formData.email_notifications_enabled;
      }
      if (formData.app_notifications_enabled !== (profileData?.profile?.app_notifications_enabled ?? false)) {
        payload.app_notifications_enabled = formData.app_notifications_enabled;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update language if changed
      if (formData.preferred_language && formData.preferred_language.toLowerCase() !== lang) {
        setLang(formData.preferred_language.toLowerCase() as 'en' | 'ar');
      }

      setSuccess(lang === 'ar' ? 'تم حفظ التغييرات بنجاح' : 'Profile updated successfully');
      await fetchProfile(); // Refresh data
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOutAll = async () => {
    try {
      const res = await fetch('/api/auth/signout-all', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to sign out from all sessions');
      }

      // Sign out from current session
      router.push('/api/auth/signout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setError(lang === 'ar' ? 'يرجى كتابة DELETE للتأكيد' : 'Please type DELETE to confirm');
      return;
    }

    try {
      setDeleting(true);
      setError(null);

      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      // Redirect to home after deletion
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Failed to load profile'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gold-600 text-white rounded hover:bg-gold-700"
          >
            {lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className={`flex flex-col sm:flex-row items-start sm:items-center ${lang === 'ar' ? 'sm:flex-row-reverse' : ''} gap-3 sm:gap-4 justify-between`}>
            <Link href="/" className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                <Image
                  src="/brand/logo.png"
                  alt="EgyptGold Pro"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 640px) 48px, 56px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">
                  {lang === 'ar' ? 'الملف الشخصي' : 'Profile'}
                </h1>
              </div>
            </Link>
            <div className={`flex items-center gap-2 sm:gap-4 w-full sm:w-auto ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <CountryCurrencySelector />
              <LanguageToggle />
              <AccountMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {/* Navigation */}
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm transition-colors"
          >
            {lang === 'ar' ? '← العودة للرئيسية' : '← Back to Dashboard'}
          </Link>
          <Link
            href="/portfolio"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm transition-colors"
          >
            {lang === 'ar' ? 'المحفظة' : 'Portfolio'}
          </Link>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-900 bg-opacity-50 border border-red-600 text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-900 bg-opacity-50 border border-green-600 text-green-200 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Account Information */}
          <section className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'معلومات الحساب' : 'Account Information'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  value={profileData.email}
                  disabled
                  className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-md px-3 py-2 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'اسم العرض' : 'Display Name'}
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={lang === 'ar' ? 'اسم العرض (اختياري)' : 'Display name (optional)'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'طريقة تسجيل الدخول' : 'Auth Provider'}
                </label>
                <input
                  type="text"
                  value={profileData.provider === 'google' ? 'Google' : profileData.provider === 'apple' ? 'Apple' : 'Email/Password'}
                  disabled
                  className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-md px-3 py-2 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'تاريخ إنشاء الحساب' : 'Account Created'}
                </label>
                <input
                  type="text"
                  value={formatDate(profileData.created_at)}
                  disabled
                  className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-md px-3 py-2 cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'التفضيلات' : 'Preferences'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'البلد الافتراضي' : 'Default Country'}
                </label>
                <select
                  value={formData.preferred_country}
                  onChange={(e) => setFormData({ ...formData, preferred_country: e.target.value as Country | '' })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{lang === 'ar' ? 'بدون افتراضي' : 'No default'}</option>
                  <option value="EG">Egypt (EG)</option>
                  <option value="AE">UAE (AE)</option>
                  <option value="SA">Saudi Arabia (SA)</option>
                  <option value="US">USA (US)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'العملة الافتراضية' : 'Default Currency'}
                </label>
                <select
                  value={formData.preferred_currency}
                  onChange={(e) => setFormData({ ...formData, preferred_currency: e.target.value as Currency | '' })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{lang === 'ar' ? 'بدون افتراضي' : 'No default'}</option>
                  <option value="EGP">EGP</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'اللغة الافتراضية' : 'Default Language'}
                </label>
                <select
                  value={formData.preferred_language}
                  onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value as Language | '' })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{lang === 'ar' ? 'بدون افتراضي' : 'No default'}</option>
                  <option value="EN">English (EN)</option>
                  <option value="AR">العربية (AR)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Notification Preferences */}
          <section className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'تفضيلات الإشعارات' : 'Notification Preferences'}
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    {lang === 'ar' ? 'تفعيل إشعارات البريد الإلكتروني' : 'Enable Email Notifications'}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {lang === 'ar' ? 'تلقي تنبيهات الأسعار عبر البريد الإلكتروني' : 'Receive price alerts via email'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, email_notifications_enabled: !formData.email_notifications_enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.email_notifications_enabled ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.email_notifications_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    {lang === 'ar' ? 'تفعيل إشعارات التطبيق' : 'Enable App Notifications'}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {lang === 'ar' ? 'إشعارات الدفع (قريباً)' : 'Push notifications (coming soon)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, app_notifications_enabled: !formData.app_notifications_enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.app_notifications_enabled ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.app_notifications_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
            <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'الأمان' : 'Security'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {lang === 'ar' ? 'الجلسة النشطة' : 'Active Session'}
                </label>
                <input
                  type="text"
                  value={profileData.provider === 'google' ? 'Google' : profileData.provider === 'apple' ? 'Apple' : 'Email/Password'}
                  disabled
                  className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-md px-3 py-2 cursor-not-allowed"
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleSignOutAll}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm transition-colors"
                >
                  {lang === 'ar' ? 'تسجيل الخروج من جميع الجلسات' : 'Sign Out from All Sessions'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
                >
                  {lang === 'ar' ? 'حذف الحساب' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
            </button>
          </div>
        </div>
      </main>
      <Footer />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" style={{ pointerEvents: 'auto' }}>
          <div className="bg-gray-900 rounded-lg shadow-xl max-w-md w-full border border-gray-700 p-6">
            <h3 className="text-xl font-semibold text-red-400 mb-4">
              {lang === 'ar' ? 'تأكيد حذف الحساب' : 'Confirm Account Deletion'}
            </h3>
            <p className="text-gray-300 mb-4">
              {lang === 'ar'
                ? 'هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك بشكل دائم. يرجى كتابة DELETE للتأكيد.'
                : 'This action cannot be undone. All your data will be permanently deleted. Please type DELETE to confirm.'}
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md transition-colors"
                disabled={deleting}
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting
                  ? (lang === 'ar' ? 'جاري الحذف...' : 'Deleting...')
                  : (lang === 'ar' ? 'حذف الحساب' : 'Delete Account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
