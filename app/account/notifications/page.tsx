'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider';
import Footer from '@/components/Footer';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';
import Link from 'next/link';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

interface NotificationRule {
  id: number;
  type: 'price_move_pct' | 'price_threshold_cross' | 'portfolio_pl_pct' | 'daily_summary' | 'weekly_outlook' | 'macro_event';
  country: Country | null;
  karat: number | null;
  direction: 'up' | 'down' | 'above' | 'below' | null;
  threshold_value: number | null;
  pct_threshold: number | null;
  one_time: boolean;
  enabled: boolean;
  channel_inapp: boolean;
  channel_push: boolean;
  channel_email: boolean;
  channel_telegram?: boolean;
  created_at: string;
}

interface InAppNotification {
  id: number;
  country: Country | null;
  title: string;
  body: string;
  url: string | null;
  kind: 'alert' | 'summary' | 'macro';
  read: boolean;
  created_at: string;
}

function NotificationsContent() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true); // Enable push by default
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [telegramConnection, setTelegramConnection] = useState<{ connected: boolean; chat_id?: string | null; username?: string | null; is_enabled?: boolean } | null>(null);
  const [telegramLink, setTelegramLink] = useState<{ token: string; expiresAt: string; botLink: string | null } | null>(null);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<Record<Country, boolean>>({
    EG: false,
    AE: false,
    SA: false,
    US: false,
  });

  // Rules state
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  // Local pct change rule (v1 rules table)
  const [localPctEnabled, setLocalPctEnabled] = useState(false);
  const [silverPctEnabled, setSilverPctEnabled] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  // In-app notifications state
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Form state for new rule
  const [ruleForm, setRuleForm] = useState({
    type: 'price_move_pct' as NotificationRule['type'],
    country: '' as Country | '',
    karat: '' as string,
    direction: '' as string,
    threshold_value: '',
    pct_threshold: '0.5',
    one_time: false,
    channel_inapp: true,
    channel_push: false,
    channel_email: false,
    channel_telegram: false,
  });

  useEffect(() => {
    checkPWAStatus();
    checkPushSupport();
    fetchPremiumStatus();
    fetchProfile();
    fetchWatchlist();
    fetchRules();
    fetchLocalPctRule();
    fetchSilverPctRule();
    fetchInAppNotifications();
    fetchTelegramStatus();
    startActivityPing();
  }, []);

  const fetchPremiumStatus = async () => {
    try {
      const res = await fetch('/api/user/premium-status', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as any;
      setIsPremium(Boolean(json?.status?.isPremium));
    } catch {
      setIsPremium(false);
    }
  };

  const fetchLocalPctRule = async () => {
    try {
      const res = await fetch('/api/notifications/local-pct-change-rule', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as any;
      if (json?.ok) setLocalPctEnabled(Boolean(json.enabled));
    } catch {
      // ignore
    }
  };

  const fetchSilverPctRule = async () => {
    try {
      const res = await fetch('/api/notifications/silver-pct-change-rule', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as any;
      if (json?.ok) setSilverPctEnabled(Boolean(json.enabled));
    } catch {
      // ignore
    }
  };

  const setLocalPctRuleEnabled = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const params = {
        thresholdPct: 0.0005,
        windowSeconds: 300,
        minAgeSeconds: 60,
        cooldownSeconds: 600,
        country: 'EG',
        karat: 24,
      };

      const res = await fetch('/api/notifications/local-pct-change-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, params }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to update rule');
      setLocalPctEnabled(enabled);
      setSuccess(
        enabled
          ? (lang === 'ar' ? 'تم تفعيل تنبيه تغير السعر المحلي 0.05%' : 'Enabled local 0.05% move alerts')
          : (lang === 'ar' ? 'تم إيقاف تنبيه تغير السعر المحلي 0.05%' : 'Disabled local 0.05% move alerts')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const setSilverPctRuleEnabled = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const params = {
        country: 'EG',
        thresholdPct: 0.001, // direction threshold
        windowSeconds: 900, // 15 minutes
        minAgeSeconds: 60,
        cooldownSeconds: 1800, // 30 minutes
      };

      const res = await fetch('/api/notifications/silver-pct-change-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, params }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to update rule');
      setSilverPctEnabled(enabled);
      setSuccess(
        enabled
          ? (lang === 'ar' ? 'تم تفعيل تنبيهات الفضة' : 'Enabled silver alerts')
          : (lang === 'ar' ? 'تم إيقاف تنبيهات الفضة' : 'Disabled silver alerts')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const checkPWAStatus = () => {
    if (typeof window === 'undefined') return;
    
    // Check if installed (standalone mode)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);
    
    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    
    // Check notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const checkPushSupport = () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      // Register service worker first, then check subscription
      registerServiceWorker().then(() => {
        checkPushSubscription();
      }).catch((err) => {
        console.error('[PUSH] Service worker registration failed:', err);
      });
    }
  };

  const registerServiceWorker = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[PUSH] Service worker registered:', registration.scope);
      return registration;
    } catch (err) {
      console.error('[PUSH] Service worker registration error:', err);
      throw err;
    }
  };

  const checkPushSubscription = async () => {
    if (!pushSupported) return;
    try {
      // Ensure service worker is ready
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(!!subscription);
      if (subscription) {
        setPushEnabled(true);
      }
    } catch (err) {
      console.error('[PUSH] Error checking subscription:', err);
    }
  };

  const startActivityPing = () => {
    // Ping every 60 seconds when logged in
    const ping = async () => {
      try {
        await fetch('/api/activity/ping', { method: 'POST' });
      } catch (err) {
        console.error('[ACTIVITY] Ping error:', err);
      }
    };

    ping(); // Initial ping
    const interval = setInterval(ping, 60000); // Every 60 seconds

    return () => clearInterval(interval);
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/profile');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              if (data.profile) {
                setEmailEnabled(data.profile.email_notifications_enabled ?? true);
                setPushEnabled(data.profile.push_notifications_enabled ?? true); // Enable push by default
              }
            } catch (parseErr) {
              console.error('Error parsing profile JSON:', parseErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/notifications/watchlist');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              const watchlistMap: Record<Country, boolean> = { EG: false, AE: false, SA: false, US: false };
              if (data.watchlist) {
                for (const item of data.watchlist) {
                  if (item.enabled) {
                    watchlistMap[item.country as Country] = true;
                  }
                }
              }
              setWatchlist(watchlistMap);
            } catch (parseErr) {
              console.error('Error parsing watchlist JSON:', parseErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/notifications/rules');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              setRules(data.rules || []);
            } catch (parseErr) {
              console.error('Error parsing rules JSON:', parseErr);
            }
          } else {
            setRules([]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching rules:', err);
    }
  };

  const fetchInAppNotifications = async () => {
    try {
      const res = await fetch('/api/notifications/inapp?limit=50');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              setInAppNotifications(data.notifications || []);
              setUnreadCount(data.notifications?.filter((n: InAppNotification) => !n.read).length || 0);
            } catch (parseErr) {
              console.error('Error parsing in-app notifications JSON:', parseErr);
            }
          } else {
            setInAppNotifications([]);
            setUnreadCount(0);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching in-app notifications:', err);
    }
  };

  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch('/api/notifications/telegram/status', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok) {
        const c = json.connection || null;
        setTelegramConnection({
          connected: !!json.connected,
          chat_id: c?.chat_id || null,
          username: c?.username || null,
          is_enabled: c?.is_enabled ?? false,
        });
      }
    } catch (err) {
      console.error('Error fetching telegram status:', err);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_notifications_enabled: emailEnabled,
          push_notifications_enabled: pushEnabled,
        }),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorMessage = 'Failed to update profile';
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              errorMessage = data.error || errorMessage;
            } catch (parseErr) {
              console.error('Error parsing error response:', parseErr);
            }
          }
        }
        throw new Error(errorMessage);
      }

      setSuccess(lang === 'ar' ? 'تم حفظ التغييرات بنجاح' : 'Settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleWatchlistChange = async (country: Country, enabled: boolean) => {
    const newWatchlist = { ...watchlist, [country]: enabled };
    setWatchlist(newWatchlist);

    try {
      const res = await fetch('/api/notifications/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, enabled }),
      });

      if (!res.ok) {
        // Revert on error
        setWatchlist(watchlist);
        throw new Error('Failed to update watchlist');
      }
    } catch (err) {
      console.error('Error updating watchlist:', err);
    }
  };

  const handleEnablePush = async () => {
    if (typeof window === 'undefined') return;
    setError(null);

    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
      alert(lang === 'ar' ? 'الإشعارات الفورية تتطلب HTTPS' : 'Push notifications require HTTPS');
      return;
    }

    if (!pushSupported) {
      alert(lang === 'ar' ? 'الإشعارات الفورية غير مدعومة' : 'Push notifications not supported');
      return;
    }

    try {
      // Request permission first
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert(lang === 'ar' ? 'تم رفض الإذن. يرجى السماح بالإشعارات في إعدادات المتصفح.' : 'Permission denied. Please allow notifications in browser settings.');
        return;
      }

      // Build-time (Vercel/local): NEXT_PUBLIC_* is inlined. Cloudflare Workers vars are often runtime-only — then fetch from API.
      let vapidPublicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
      if (!vapidPublicKey) {
        const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
        const keyJson = (await keyRes.json().catch(() => null)) as { ok?: boolean; publicKey?: string; error?: string } | null;
        if (keyRes.ok && keyJson?.ok && keyJson.publicKey?.trim()) {
          vapidPublicKey = keyJson.publicKey.trim();
        }
      }
      if (!vapidPublicKey) {
        console.error('[PUSH] VAPID public key unavailable (client env + /api/push/vapid-public-key)');
        setError(
          lang === 'ar'
            ? 'مفتاح الإشعارات غير مضبوط على الخادم. أضف VAPID_PUBLIC_KEY (أو NEXT_PUBLIC_VAPID_PUBLIC_KEY وقت البناء) في إعدادات Cloudflare / wrangler.'
            : 'Push is not configured on the server. Set VAPID_PUBLIC_KEY (and VAPID_PRIVATE_KEY) in Cloudflare Worker vars/secrets, or NEXT_PUBLIC_VAPID_PUBLIC_KEY at build time.'
        );
        return;
      }

      console.log('[PUSH] VAPID public key found:', vapidPublicKey.substring(0, 20) + '...');

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
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        console.log('[PUSH] Service worker registered:', registration.scope);
        
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
        console.log('[PUSH] Service worker ready');
        
        // Update service worker if available
        if (registration.update) {
          await registration.update();
        }
      } catch (swError) {
        console.error('[PUSH] Service worker registration error:', swError);
        const errorMsg = swError instanceof Error ? swError.message : 'Unknown error';
        alert(lang === 'ar' ? `فشل تسجيل خدمة العامل: ${errorMsg}. تأكد من أن الموقع يعمل على HTTPS.` : `Failed to register service worker: ${errorMsg}. Make sure the site is running on HTTPS.`);
        return;
      }

      // Get the active registration
      registration = await navigator.serviceWorker.ready;
      if (!registration) {
        throw new Error('Service worker registration not available');
      }

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
        console.log('[PUSH] Push subscription created:', subscription.endpoint.substring(0, 50) + '...');
      } catch (subError) {
        console.error('[PUSH] Push subscription error:', subError);
        const errorMsg = subError instanceof Error ? subError.message : 'Unknown error';
        alert(lang === 'ar' ? `فشل الاشتراك في الإشعارات: ${errorMsg}` : `Failed to subscribe to push: ${errorMsg}`);
        return;
      }

      // Convert ArrayBuffer keys to base64 strings for JSON serialization
      const getBase64FromArrayBuffer = (buffer: ArrayBuffer): string => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      };

      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');

      if (!p256dhKey || !authKey) {
        throw new Error('Failed to get subscription keys');
      }

      const subscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: getBase64FromArrayBuffer(p256dhKey),
          auth: getBase64FromArrayBuffer(authKey),
        },
      };

      // Send subscription data to server
      console.log('[PUSH] Sending subscription to server:', subscriptionData.endpoint.substring(0, 50) + '...');
      const res = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriptionData),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorMsg = 'Failed to save subscription';
        let errorData: any = null;
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              errorData = JSON.parse(text);
              errorMsg = errorData.error || errorMsg;
            } catch (parseErr) {
              console.error('[PUSH] Error parsing error response:', parseErr);
            }
          }
        }
        console.error('[PUSH] Server error:', errorData);
        console.error('[PUSH] Full error details:', { status: res.status, statusText: res.statusText, errorData });
        throw new Error(errorMsg);
      }

      const contentType = res.headers.get('content-type');
      let result: any = { success: true };
      if (contentType && contentType.includes('application/json')) {
        const text = await res.text();
        if (text.trim()) {
          try {
            result = JSON.parse(text);
          } catch (parseErr) {
            console.error('[PUSH] Error parsing success response:', parseErr);
          }
        }
      }
      console.log('[PUSH] Subscription saved successfully:', result);
      
      setPushSubscribed(true);
      setPushEnabled(true);
      await handleSaveProfile();
      setSuccess(lang === 'ar' ? 'تم تفعيل الإشعارات الفورية بنجاح' : 'Push notifications enabled successfully');
    } catch (err) {
      console.error('[PUSH] Error enabling push:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[PUSH] Full error details:', {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(lang === 'ar' ? `فشل تفعيل الإشعارات الفورية: ${errorMessage}` : `Failed to enable push notifications: ${errorMessage}`);
    }
  };

  const handleDisablePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/notifications/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPushSubscribed(false);
      setPushEnabled(false);
      await handleSaveProfile();
    } catch (err) {
      console.error('Error disabling push:', err);
    }
  };

  const handleGenerateTelegramLink = async () => {
    setError(null);
    try {
      const res = await fetch('/api/notifications/telegram/link-token', {
        method: 'POST',
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to generate Telegram link token');
      setTelegramLink({
        token: String(json.token),
        expiresAt: String(json.expiresAt),
        botLink: json.botLink ? String(json.botLink) : null,
      });
      setSuccess(lang === 'ar' ? 'تم إنشاء رابط ربط تيليجرام. افتح البوت وأرسل /start <token>' : 'Telegram link token generated. Open the bot and send /start <token>.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Telegram link token');
    }
  };

  const handleToggleTelegram = async () => {
    if (!telegramConnection?.connected) return;
    setError(null);
    const enabled = !telegramConnection.is_enabled;
    try {
      const res = await fetch('/api/notifications/telegram/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to update Telegram settings');
      await fetchTelegramStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Telegram settings');
    }
  };

  const handleDisconnectTelegram = async () => {
    setError(null);
    try {
      const res = await fetch('/api/notifications/telegram/disconnect', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to disconnect Telegram');
      setTelegramLink(null);
      await fetchTelegramStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Telegram');
    }
  };

  const handleCreateRule = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        type: ruleForm.type,
        channel_inapp: ruleForm.channel_inapp,
        channel_push: ruleForm.channel_push,
        channel_email: ruleForm.channel_email,
        channel_telegram: ruleForm.channel_telegram,
      };

      if (ruleForm.country) payload.country = ruleForm.country;
      if (ruleForm.karat) payload.karat = parseInt(ruleForm.karat);
      if (ruleForm.direction) payload.direction = ruleForm.direction;
      if (ruleForm.threshold_value) payload.threshold_value = parseFloat(ruleForm.threshold_value);
      if (ruleForm.pct_threshold) payload.pct_threshold = parseFloat(ruleForm.pct_threshold) / 100;

      // Auto-set one_time for certain types
      if (ruleForm.type === 'price_threshold_cross' || ruleForm.type === 'portfolio_pl_pct') {
        payload.one_time = true;
      } else {
        payload.one_time = ruleForm.one_time;
      }

      const url = editingRule ? `/api/notifications/rules/${editingRule.id}` : '/api/notifications/rules';
      const method = editingRule ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorMessage = 'Failed to save rule';
        if (contentType && contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim()) {
            try {
              const data = JSON.parse(text);
              errorMessage = data.error || errorMessage;
            } catch (parseErr) {
              console.error('Error parsing error response:', parseErr);
            }
          }
        }
        throw new Error(errorMessage);
      }

      setShowAddRule(false);
      setEditingRule(null);
      fetchRules();
      setSuccess(lang === 'ar' ? 'تم حفظ القاعدة' : 'Rule saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
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

      if (!res.ok) {
        throw new Error('Failed to delete rule');
      }

      fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleToggleRule = async (rule: NotificationRule) => {
    try {
      const res = await fetch(`/api/notifications/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle rule');
      }

      fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleMarkRead = async (ids?: number[]) => {
    try {
      const res = await fetch('/api/notifications/inapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });

      if (res.ok) {
        fetchInAppNotifications();
      }
    } catch (err) {
      console.error('Error marking as read:', err);
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

  return (
    <div className="min-h-screen bg-black">
      <Header title={lang === 'ar' ? 'الإشعارات' : 'Notifications'} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
          {/* Global Settings */}
          <section className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8">
            <h2 className={`text-xl font-semibold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'الإعدادات العامة' : 'Global Settings'}
            </h2>
            <div className="space-y-6">
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
                  onClick={() => {
                    setEmailEnabled(!emailEnabled);
                    handleSaveProfile();
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailEnabled ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-300">
                    {lang === 'ar' ? 'تفعيل الإشعارات الفورية' : 'Enable Push Notifications'}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {lang === 'ar' ? 'تلقي إشعارات على سطح المكتب والهاتف' : 'Receive notifications on desktop and mobile'}
                  </p>
                  {/* PWA-specific status messages */}
                  {!pushSupported && (
                    <p className="text-xs text-yellow-500 mt-1">
                      {lang === 'ar' ? 'الإشعارات الفورية غير مدعومة في هذا المتصفح' : 'Push notifications not supported in this browser'}
                    </p>
                  )}
                  {pushSupported && notificationPermission === 'denied' && (
                    <p className="text-xs text-yellow-500 mt-1">
                      {lang === 'ar' ? 'تم رفض الإذن. يرجى السماح بالإشعارات في إعدادات المتصفح.' : 'Permission denied. Please enable notifications in browser settings.'}
                    </p>
                  )}
                  {pushSupported && isIOS && !isInstalled && (
                    <p className="text-xs text-yellow-500 mt-1">
                      {lang === 'ar' ? 'للحصول على إشعارات على iOS، قم بتثبيت التطبيق على الشاشة الرئيسية (Share → Add to Home Screen)' : 'For push notifications on iOS, install the app to Home Screen (Share → Add to Home Screen)'}
                    </p>
                  )}
                  {isInstalled && (
                    <p className="text-xs text-green-500 mt-1">
                      {lang === 'ar' ? '✓ التطبيق مثبت' : '✓ App installed'}
                    </p>
                  )}
                </div>
                {pushSupported ? (
                  pushSubscribed ? (
                    <button
                      type="button"
                      onClick={handleDisablePush}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md"
                    >
                      {lang === 'ar' ? 'تعطيل' : 'Disable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnablePush}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md"
                      disabled={notificationPermission === 'denied'}
                    >
                      {lang === 'ar' ? 'تفعيل' : 'Enable'}
                    </button>
                  )
                ) : (
                  <span className="text-xs text-gray-500">
                    {lang === 'ar' ? 'غير مدعوم' : 'Not supported'}
                  </span>
                )}
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300">
                      {lang === 'ar' ? 'ربط تيليجرام' : 'Connect Telegram'}
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      {telegramConnection?.connected
                        ? (telegramConnection.username
                          ? `@${telegramConnection.username}`
                          : (lang === 'ar' ? 'تم الربط بدون اسم مستخدم' : 'Connected (no username)'))
                        : (lang === 'ar' ? 'اربط حسابك لتلقي التنبيهات مجاناً عبر Telegram' : 'Link your account to receive free Telegram alerts')}
                    </p>
                  </div>
                  {!telegramConnection?.connected ? (
                    <button
                      type="button"
                      onClick={handleGenerateTelegramLink}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-md"
                    >
                      {lang === 'ar' ? 'إنشاء رابط' : 'Generate Link'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleTelegram}
                        className={`px-3 py-2 text-sm rounded-md ${telegramConnection.is_enabled ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                      >
                        {telegramConnection.is_enabled ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectTelegram}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md"
                      >
                        {lang === 'ar' ? 'فصل' : 'Disconnect'}
                      </button>
                    </div>
                  )}
                </div>

                {telegramLink && (
                  <div className="mt-3 rounded-md border border-gray-700 bg-gray-950 p-3 text-xs text-gray-300 space-y-2">
                    {telegramLink.botLink ? (
                      <div>
                        <a href={telegramLink.botLink} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 underline">
                          {lang === 'ar' ? 'افتح البوت مباشرة' : 'Open bot directly'}
                        </a>
                      </div>
                    ) : null}
                    <div className="font-mono">/start {telegramLink.token}</div>
                    <div className="text-gray-500">
                      {lang === 'ar' ? 'ينتهي الرمز في:' : 'Token expires at:'} {new Date(telegramLink.expiresAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Country Watchlist */}
          <section className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8">
            <h2 className={`text-xl font-semibold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
              {lang === 'ar' ? 'قائمة المراقبة' : 'Country Watchlist'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(['EG', 'AE', 'SA', 'US'] as Country[]).map((country) => (
                <label key={country} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchlist[country]}
                    onChange={(e) => handleWatchlistChange(country, e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">
                    {country === 'EG' ? 'Egypt' : country === 'AE' ? 'UAE' : country === 'SA' ? 'Saudi Arabia' : 'USA'}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Rules Manager */}
          <section className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8">
            <div className={`flex items-center justify-between mb-6 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <h2 className={`text-xl font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'قواعد الإشعارات' : 'Notification Rules'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setRuleForm({
                    type: 'price_move_pct',
                    country: '',
                    karat: '',
                    direction: '',
                    threshold_value: '',
                    pct_threshold: '0.5',
                    one_time: false,
                    channel_inapp: true,
                    channel_push: false,
                    channel_email: false,
                    channel_telegram: false,
                  });
                  setShowAddRule(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md"
              >
                {lang === 'ar' ? '+ إضافة قاعدة' : '+ Add Rule'}
              </button>
            </div>

            {/* Quick toggle: local 0.05% move push alerts (v1 rules table) */}
            <div className="mb-6 rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className={`flex items-start justify-between gap-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-100">
                    {lang === 'ar'
                      ? 'تنبيه عند تغير السعر المحلي بنسبة 0.05%'
                      : 'Notify me when local price changes by 0.05%'}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {lang === 'ar'
                      ? 'يتطلب تفعيل إشعارات الدفع. حد أقصى إشعار كل 10 دقائق.'
                      : 'Requires push enabled. Max 1 notification per 10 minutes.'}
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localPctEnabled}
                    disabled={saving}
                    onChange={(e) => void setLocalPctRuleEnabled(e.target.checked)}
                    className="w-5 h-5 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">{localPctEnabled ? (lang === 'ar' ? 'مفعل' : 'On') : (lang === 'ar' ? 'معطل' : 'Off')}</span>
                </label>
              </div>
            </div>

            {/* Quick toggle: Silver alerts (Premium-only) */}
            <div className="mb-6 rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className={`flex items-start justify-between gap-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-100">
                    {lang === 'ar' ? 'تنبيهات الفضة (مميز)' : 'Silver alerts (Premium)'}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {lang === 'ar'
                      ? 'تنبيه عند تغيّر اتجاه الفضة أو حركة قوية خلال 15 دقيقة. (يتطلب إشعارات الدفع)'
                      : 'Alert on silver direction flip or big move within 15 minutes. (Requires push enabled)'}
                  </div>
                  <div className="mt-2 rounded-md border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                    <div className="font-semibold">{lang === 'ar' ? 'الفضة أكثر تقلبًا' : 'Silver is more volatile'}</div>
                    <div className="mt-1">
                      {lang === 'ar'
                        ? 'الفضة تتحرك أسرع من الذهب وقد تغيّر اتجاهها بسرعة. اعتبرها إشارة وليست ضمانًا.'
                        : 'Silver moves faster than gold and can change direction quickly. Use it as a signal, not certainty.'}
                    </div>
                  </div>
                  {!isPremium && (
                    <div className={`mt-3 text-xs text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                      <div className="font-semibold">{lang === 'ar' ? 'افتح إشارات الفضة' : 'Unlock Silver Signals'}</div>
                      <Link href="/premium" className="mt-2 inline-flex text-blue-300 hover:text-blue-200">
                        {lang === 'ar' ? 'اشترك بريميوم' : 'Go Premium'}
                      </Link>
                    </div>
                  )}
                </div>
                {isPremium ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={silverPctEnabled}
                      disabled={saving}
                      onChange={(e) => void setSilverPctRuleEnabled(e.target.checked)}
                      className="w-5 h-5 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">{silverPctEnabled ? (lang === 'ar' ? 'مفعل' : 'On') : (lang === 'ar' ? 'معطل' : 'Off')}</span>
                  </label>
                ) : (
                  <span className="text-xs text-gray-500">{lang === 'ar' ? 'مقفل' : 'Locked'}</span>
                )}
              </div>
            </div>

            {rules.length === 0 ? (
              <p className="text-gray-400 text-sm">
                {lang === 'ar' ? 'لا توجد قواعد. ابدأ بإضافة قاعدة جديدة.' : 'No rules. Start by adding a new rule.'}
              </p>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div key={rule.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          rule.enabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                        }`}>
                          {rule.enabled ? (lang === 'ar' ? 'مفعل' : 'Enabled') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                        </span>
                        <span className="text-sm text-gray-300">
                          {rule.type === 'price_move_pct' ? (lang === 'ar' ? 'تغيير السعر ≥ 0.5%' : 'Price Move ≥ 0.5%') :
                           rule.type === 'price_threshold_cross' ? (lang === 'ar' ? 'عتبة مخصصة' : 'Custom Threshold') :
                           rule.type === 'portfolio_pl_pct' ? (lang === 'ar' ? 'ربح/خسارة المحفظة ≥ 5%' : 'Portfolio P/L ≥ 5%') :
                           rule.type === 'daily_summary' ? (lang === 'ar' ? 'ملخص يومي' : 'Daily Summary') :
                           rule.type === 'weekly_outlook' ? (lang === 'ar' ? 'نظرة أسبوعية' : 'Weekly Outlook') :
                           (lang === 'ar' ? 'حدث اقتصادي' : 'Macro Event')}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {rule.country && `${rule.country} `}
                        {rule.karat && `${rule.karat}k `}
                        {rule.direction && `${rule.direction} `}
                        {rule.threshold_value && `${rule.threshold_value} `}
                        {rule.pct_threshold && `${(rule.pct_threshold * 100).toFixed(1)}% `}
                        {rule.one_time && (lang === 'ar' ? '(مرة واحدة)' : '(one-time)')}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {[
                          rule.channel_inapp ? 'In-App' : null,
                          rule.channel_push ? 'Push' : null,
                          rule.channel_email ? 'Email' : null,
                          rule.channel_telegram ? 'Telegram' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        {rule.enabled ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        {lang === 'ar' ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* In-App Notifications */}
          <section className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8">
            <div className={`flex items-center justify-between mb-6 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <h2 className={`text-xl font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'الإشعارات' : 'In-App Notifications'}
                {unreadCount > 0 && (
                  <span className="ml-2 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h2>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleMarkRead()}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                </button>
              )}
            </div>

            {inAppNotifications.length === 0 ? (
              <p className="text-gray-400 text-sm">
                {lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
              </p>
            ) : (
              <div className="space-y-3">
                {inAppNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`bg-gray-800 rounded-lg p-4 ${!notif.read ? 'border-l-4 border-blue-600' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className={`flex items-center justify-between gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                          <h3 className="text-sm font-semibold text-gray-200 mb-1">{notif.title}</h3>
                          <Link
                            href={`/account/notifications/${notif.id}`}
                            className="text-xs text-blue-300 hover:text-blue-200 whitespace-nowrap"
                          >
                            {lang === 'ar' ? 'عرض' : 'View'}
                          </Link>
                        </div>
                        <p className="text-sm text-gray-400">{notif.body}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(notif.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead([notif.id])}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {lang === 'ar' ? 'تحديد كمقروء' : 'Mark read'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />

      {/* Add/Edit Rule Modal */}
      <Modal
        isOpen={showAddRule}
        onClose={() => {
          setShowAddRule(false);
          setEditingRule(null);
        }}
        title={editingRule ? (lang === 'ar' ? 'تعديل القاعدة' : 'Edit Rule') : (lang === 'ar' ? 'إضافة قاعدة جديدة' : 'Add New Rule')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'نوع القاعدة' : 'Rule Type'} *
            </label>
            <select
              value={ruleForm.type}
              onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value as NotificationRule['type'] })}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
            >
              <option value="price_move_pct">{lang === 'ar' ? 'تغيير السعر ≥ 0.5%' : 'Price Move ≥ 0.5%'}</option>
              <option value="price_threshold_cross">{lang === 'ar' ? 'عتبة مخصصة' : 'Custom Threshold'}</option>
              <option value="portfolio_pl_pct">{lang === 'ar' ? 'ربح/خسارة المحفظة ≥ 5%' : 'Portfolio P/L ≥ 5%'}</option>
              <option value="daily_summary">{lang === 'ar' ? 'ملخص يومي' : 'Daily Summary'}</option>
              <option value="weekly_outlook">{lang === 'ar' ? 'نظرة أسبوعية' : 'Weekly Outlook'}</option>
              <option value="macro_event">{lang === 'ar' ? 'حدث اقتصادي' : 'Macro Event'}</option>
            </select>
          </div>

          {['price_move_pct', 'price_threshold_cross'].includes(ruleForm.type) && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'البلد' : 'Country'}
                </label>
                <select
                  value={ruleForm.country}
                  onChange={(e) => setRuleForm({ ...ruleForm, country: e.target.value as Country | '' })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                >
                  <option value="">{lang === 'ar' ? 'اختر البلد' : 'Select Country'}</option>
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
                  value={ruleForm.karat}
                  onChange={(e) => setRuleForm({ ...ruleForm, karat: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                >
                  <option value="">{lang === 'ar' ? 'اختر العيار' : 'Select Karat'}</option>
                  <option value="14">14k</option>
                  <option value="18">18k</option>
                  <option value="21">21k</option>
                  <option value="24">24k</option>
                </select>
              </div>
            </>
          )}

          {ruleForm.type === 'price_threshold_cross' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'الاتجاه' : 'Direction'} *
                </label>
                <select
                  value={ruleForm.direction}
                  onChange={(e) => setRuleForm({ ...ruleForm, direction: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                  required
                >
                  <option value="">{lang === 'ar' ? 'اختر الاتجاه' : 'Select Direction'}</option>
                  <option value="above">{lang === 'ar' ? 'فوق' : 'Above'}</option>
                  <option value="below">{lang === 'ar' ? 'تحت' : 'Below'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {lang === 'ar' ? 'قيمة العتبة' : 'Threshold Value'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={ruleForm.threshold_value}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold_value: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                  required
                />
              </div>
            </>
          )}

          {ruleForm.type === 'price_move_pct' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {lang === 'ar' ? 'نسبة التغيير (%)' : 'Change Percentage (%)'}
              </label>
              <input
                type="number"
                step="0.1"
                value={ruleForm.pct_threshold}
                onChange={(e) => setRuleForm({ ...ruleForm, pct_threshold: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2"
              />
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                {lang === 'ar' ? 'إشعارات داخل التطبيق' : 'In-App Notifications'}
              </label>
              <button
                type="button"
                onClick={() => setRuleForm({ ...ruleForm, channel_inapp: !ruleForm.channel_inapp })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ruleForm.channel_inapp ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ruleForm.channel_inapp ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                {lang === 'ar' ? 'إشعارات البريد الإلكتروني' : 'Email Notifications'}
              </label>
              <button
                type="button"
                onClick={() => setRuleForm({ ...ruleForm, channel_email: !ruleForm.channel_email })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ruleForm.channel_email ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ruleForm.channel_email ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                {lang === 'ar' ? 'الإشعارات الفورية' : 'Push Notifications'}
              </label>
              <button
                type="button"
                onClick={() => setRuleForm({ ...ruleForm, channel_push: !ruleForm.channel_push })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ruleForm.channel_push ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ruleForm.channel_push ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                Telegram
              </label>
              <button
                type="button"
                onClick={() => setRuleForm({ ...ruleForm, channel_telegram: !ruleForm.channel_telegram })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ruleForm.channel_telegram ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ruleForm.channel_telegram ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowAddRule(false);
                setEditingRule(null);
              }}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md"
              disabled={saving}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleCreateRule}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              disabled={saving}
            >
              {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
        </div>
      </div>
    }>
      <NotificationsContent />
    </Suspense>
  );
}
