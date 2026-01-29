'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/components/LanguageProvider';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const { lang } = useLang();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      const isStandalone = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
      return isStandalone;
    };

    if (checkInstalled()) {
      return;
    }

    // Check if dismissed
    const dismissedKey = 'pwa-install-dismissed';
    const wasDismissed = localStorage.getItem(dismissedKey) === 'true';
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isIOSSafari = isIOS && !(window.navigator as any).standalone;

    // Detect Android
    const isAndroid = /Android/.test(navigator.userAgent);

    // Android: listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (isAndroid) {
        setShowAndroidPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS: show prompt if Safari and not installed
    if (isIOSSafari) {
      setShowIOSPrompt(true);
    }

    // Check installed status on load
    checkInstalled();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowAndroidPrompt(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleDismiss = () => {
    setShowAndroidPrompt(false);
    setShowIOSPrompt(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if installed or dismissed
  if (isInstalled || dismissed) {
    return null;
  }

  // Don't show on admin/account pages
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin') || pathname.startsWith('/account')) {
      return null;
    }
  }

  return (
    <>
      {showAndroidPrompt && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Install EgyptGold Pro</h3>
              <p className="text-gray-400 text-sm mb-3">
                Get quick access to gold prices, forecasts, and notifications.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="bg-yellow-600 hover:bg-yellow-700 text-black px-4 py-2 rounded text-sm font-semibold"
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-white ml-2"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showIOSPrompt && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Install EgyptGold Pro</h3>
              <p className="text-gray-400 text-sm mb-2">
                Tap the Share button <span className="inline-block">📤</span> then select &quot;Add to Home Screen&quot;
              </p>
              <button
                onClick={handleDismiss}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm mt-2"
              >
                Got it
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-white ml-2"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
