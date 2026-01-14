'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/components/LanguageProvider';

export default function NotificationPrompt() {
  const { lang } = useLang();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    if (typeof window === 'undefined') return;
    
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (!supported) return;

    // Check if user has already been prompted (stored in localStorage)
    const hasBeenPrompted = localStorage.getItem('notification_prompt_shown');
    const permission = Notification.permission;

    // Show prompt if:
    // 1. User hasn't been prompted before
    // 2. Permission is default (not granted or denied)
    // 3. User is on HTTPS or localhost
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    
    if (!hasBeenPrompted && permission === 'default' && isSecure) {
      // Small delay to let page load
      setTimeout(() => {
        setShowPrompt(true);
      }, 2000);
    }
  }, []);

  const handleAllow = async () => {
    try {
      const permission = await Notification.requestPermission();
      localStorage.setItem('notification_prompt_shown', 'true');
      setShowPrompt(false);

      if (permission === 'granted') {
        // Check if user is logged in before trying to subscribe
        // We'll let the notifications page handle the actual subscription
        // Just close the prompt for now
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      localStorage.setItem('notification_prompt_shown', 'true');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('notification_prompt_shown', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt || !isSupported) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-slide-up">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-100 mb-1">
              {lang === 'ar' ? 'تفعيل الإشعارات' : 'Enable Notifications'}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {lang === 'ar' 
                ? 'احصل على تنبيهات فورية عند تغيير أسعار الذهب' 
                : 'Get instant alerts when gold prices change'}
            </p>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={handleAllow}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                {lang === 'ar' ? 'السماح' : 'Allow'}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-md transition-colors"
              >
                {lang === 'ar' ? 'لاحقاً' : 'Later'}
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-300 transition-colors"
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

