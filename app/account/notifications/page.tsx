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
import Modal from '@/components/ui/Modal';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

interface NotificationRule {
  id: number;
  country: Country;
  karat: number;
  side: 'buy' | 'sell';
  currency: Currency;
  direction: 'above' | 'below';
  threshold: number;
  cooldown_minutes: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface Delivery {
  id: number;
  rule_id: number;
  channel: 'email' | 'push';
  status: 'sent' | 'failed' | 'skipped';
  sent_at: string;
  error: string | null;
  user_notification_rules: NotificationRule;
}

export default function NotificationsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  const [formData, setFormData] = useState({
    country: 'EG' as Country,
    karat: 24,
    side: 'buy' as 'buy' | 'sell',
    currency: 'EGP' as Currency,
    direction: 'above' as 'above' | 'below',
    threshold: '',
    cooldown_minutes: 180,
  });

  useEffect(() => {
    fetchRules();
    fetchDeliveries();
    checkPushSupport();
    checkPushSubscription();
  }, []);

  const checkPushSupport = () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
    }
  };

  const checkPushSubscription = async () => {
    if (!pushSupported) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushEnabled(!!subscription);
    } catch (err) {
      console.error('Error checking push subscription:', err);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/notifications/rules');
      if (res.status === 401) {
        router.push('/auth/signin');
        return;
      }
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      const res = await fetch('/api/notifications/deliveries?limit=20');
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch (err) {
      console.error('Error fetching deliveries:', err);
    }
  };

  const handleCreateRule = async () => {
    try {
      const res = await fetch('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          threshold: parseFloat(formData.threshold),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create rule');
        return;
      }

      setShowAddModal(false);
      fetchRules();
      setFormData({
        country: 'EG',
        karat: 24,
        side: 'buy',
        currency: 'EGP',
        direction: 'above',
        threshold: '',
        cooldown_minutes: 180,
      });
    } catch (err) {
      alert('Error creating rule');
    }
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/notifications/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذه القاعدة؟' : 'Are you sure you want to delete this rule?')) {
      return;
    }

    try {
      const res = await fetch(`/api/notifications/rules/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  const handleEnablePush = async () => {
    if (!pushSupported) {
      alert(lang === 'ar' ? 'الإشعارات الفورية غير مدعومة في هذا المتصفح' : 'Push notifications are not supported in this browser');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert(lang === 'ar' ? 'تم رفض الإذن' : 'Permission denied');
        return;
      }

      // Check if VAPID public key is configured
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        alert(lang === 'ar' ? 'إعدادات الإشعارات الفورية غير مكتملة. يرجى الاتصال بالدعم.' : 'Push notification settings are incomplete. Please contact support.');
        return;
      }

      // Convert VAPID key from base64 URL-safe to Uint8Array
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
          .replace(/\-/g, '+')
          .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      // Register service worker
      let registration;
      try {
        registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
      } catch (swError) {
        console.error('Service worker registration error:', swError);
        alert(lang === 'ar' ? 'فشل تسجيل خدمة العامل. تأكد من أن الموقع يعمل على HTTPS.' : 'Failed to register service worker. Make sure the site is running on HTTPS.');
        return;
      }

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });

      // Convert keys to base64 for storage
      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');
      
      if (!p256dhKey || !authKey) {
        throw new Error('Failed to get subscription keys');
      }

      const p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhKey)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(authKey)));

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: p256dh,
            auth: auth,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save subscription');
      }

      setPushEnabled(true);
      alert(lang === 'ar' ? 'تم تفعيل الإشعارات الفورية بنجاح' : 'Push notifications enabled successfully');
    } catch (err) {
      console.error('Error enabling push:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(lang === 'ar' ? `فشل تفعيل الإشعارات الفورية: ${errorMessage}` : `Failed to enable push notifications: ${errorMessage}`);
    }
  };

  const handleDisablePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        setPushEnabled(false);
      }
    } catch (err) {
      console.error('Error disabling push:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className={`flex flex-col sm:flex-row items-start sm:items-center ${lang === 'ar' ? 'sm:flex-row-reverse' : ''} gap-3 sm:gap-4 justify-between`}>
            <Link href="/" className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                <Image src="/brand/logo.png" alt="EgyptGold Pro" fill className="object-contain" priority sizes="(max-width: 640px) 48px, 56px" />
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">
                {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
              </h1>
            </Link>
            <div className={`flex items-center gap-2 sm:gap-4 w-full sm:w-auto ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <CountryCurrencySelector />
              <LanguageToggle />
              <AccountMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-6">
          <Link href="/account/profile" className="text-blue-400 hover:text-blue-300 text-sm">
            {lang === 'ar' ? '← العودة للملف الشخصي' : '← Back to Profile'}
          </Link>
        </div>

        {/* Push Notifications Toggle */}
        {pushSupported && (
          <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-1">
                  {lang === 'ar' ? 'الإشعارات الفورية' : 'Push Notifications'}
                </h3>
                <p className="text-sm text-gray-400">
                  {lang === 'ar' ? 'تلقي إشعارات على سطح المكتب والهاتف' : 'Receive notifications on desktop and mobile'}
                </p>
              </div>
              {pushEnabled ? (
                <button
                  onClick={handleDisablePush}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm"
                >
                  {lang === 'ar' ? 'تعطيل' : 'Disable'}
                </button>
              ) : (
                <button
                  onClick={handleEnablePush}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                >
                  {lang === 'ar' ? 'تفعيل' : 'Enable'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Rules Section */}
        <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 mb-6">
          <div className={`flex items-center justify-between mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <h2 className={`text-lg font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'قواعد الإشعارات' : 'Notification Rules'}
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
            >
              {lang === 'ar' ? '+ إضافة قاعدة' : '+ Add Rule'}
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              {lang === 'ar' ? 'لا توجد قواعد. ابدأ بإضافة قاعدة جديدة.' : 'No rules. Start by adding a new rule.'}
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-200">
                        {rule.country} {rule.karat}k {rule.side} {rule.direction} {rule.currency} {rule.threshold}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${rule.enabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                        {rule.enabled ? (lang === 'ar' ? 'مفعل' : 'Enabled') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {lang === 'ar' ? 'فترة التهدئة' : 'Cooldown'}: {rule.cooldown_minutes} {lang === 'ar' ? 'دقيقة' : 'minutes'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.enabled)}
                      className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
                    >
                      {rule.enabled ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                    >
                      {lang === 'ar' ? 'حذف' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
          <h2 className={`text-lg font-semibold text-gray-100 mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'التسليمات الأخيرة' : 'Recent Deliveries'}
          </h2>
          {deliveries.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              {lang === 'ar' ? 'لا توجد تسليمات' : 'No deliveries yet'}
            </p>
          ) : (
            <div className="space-y-2">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="bg-gray-800 rounded p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">
                      {delivery.user_notification_rules.country} {delivery.user_notification_rules.karat}k
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      delivery.status === 'sent' ? 'bg-green-600' :
                      delivery.status === 'failed' ? 'bg-red-600' : 'bg-gray-600'
                    }`}>
                      {delivery.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(delivery.sent_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Rule Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={lang === 'ar' ? 'إضافة قاعدة إشعار' : 'Add Notification Rule'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'البلد' : 'Country'}
            </label>
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value as Country })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value="EG">Egypt</option>
              <option value="AE">UAE</option>
              <option value="SA">Saudi Arabia</option>
              <option value="US">USA</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'العيار' : 'Karat'}
            </label>
            <select
              value={formData.karat}
              onChange={(e) => setFormData({ ...formData, karat: parseInt(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value={14}>14k</option>
              <option value={18}>18k</option>
              <option value={21}>21k</option>
              <option value={24}>24k</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'الجانب' : 'Side'}
            </label>
            <select
              value={formData.side}
              onChange={(e) => setFormData({ ...formData, side: e.target.value as 'buy' | 'sell' })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value="buy">{lang === 'ar' ? 'شراء' : 'Buy'}</option>
              <option value="sell">{lang === 'ar' ? 'بيع' : 'Sell'}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'العملة' : 'Currency'}
            </label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
              <option value="SAR">SAR</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'الاتجاه' : 'Direction'}
            </label>
            <select
              value={formData.direction}
              onChange={(e) => setFormData({ ...formData, direction: e.target.value as 'above' | 'below' })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value="above">{lang === 'ar' ? 'فوق' : 'Above'}</option>
              <option value="below">{lang === 'ar' ? 'تحت' : 'Below'}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'الحد الأدنى' : 'Threshold'}
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.threshold}
              onChange={(e) => setFormData({ ...formData, threshold: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'فترة التهدئة (دقائق)' : 'Cooldown (minutes)'}
            </label>
            <input
              type="number"
              value={formData.cooldown_minutes}
              onChange={(e) => setFormData({ ...formData, cooldown_minutes: parseInt(e.target.value) || 180 })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md"
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleCreateRule}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              {lang === 'ar' ? 'حفظ' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

