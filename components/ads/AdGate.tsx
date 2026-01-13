/**
 * Ad Gate Component
 * 
 * Client-side component that checks consent and user type before rendering ads
 */

'use client';

import { useEffect, useState, ReactNode } from 'react';
import AdsenseAd from './AdsenseAd';

interface AdGateProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  className?: string;
  fallback?: ReactNode;
}

export default function AdGate({
  slot,
  format,
  className,
  fallback,
}: AdGateProps) {
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  useEffect(() => {
    // Check cookie consent (client-side)
    const checkConsent = () => {
      const cookieConsent = document.cookie
        .split('; ')
        .find((row) => row.startsWith('cookie_consent='))
        ?.split('=')[1];
      
      const localStorageConsent = localStorage.getItem('cookie_consent');
      const consent = cookieConsent || localStorageConsent;

      if (consent !== 'accepted') {
        setCanShowAd(false);
        return;
      }

      // If consent is given, check user type via API
      fetch('/api/ads/check')
        .then((res) => res.json())
        .then((data) => {
          setCanShowAd(data.shouldShow === true);
        })
        .catch((error) => {
          console.error('[AdGate] Error checking ad visibility:', error);
          setCanShowAd(false);
        });
    };

    checkConsent();

    // Re-check periodically (in case consent changes)
    const interval = setInterval(checkConsent, 2000);
    return () => clearInterval(interval);
  }, []);

  // Loading state - don't render anything
  if (canShowAd === null) {
    return null;
  }

  // Don't show ad
  if (!canShowAd) {
    return <>{fallback}</> || null;
  }

  // Show ad
  return (
    <AdsenseAd
      slot={slot}
      format={format}
      className={className}
    />
  );
}

