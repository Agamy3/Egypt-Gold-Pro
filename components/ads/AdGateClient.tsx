/**
 * Ad Gate Client Component
 * 
 * Client-side wrapper for ad units (used in client components)
 */

'use client';

import { useEffect, useState, ReactNode } from 'react';
import AdSenseUnit from './AdSenseUnit';

interface AdGateClientProps {
  adSlot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export default function AdGateClient({
  adSlot,
  format,
  fullWidthResponsive,
  className,
  style,
  children,
}: AdGateClientProps) {
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
          console.error('[AdGateClient] Error checking ad visibility:', error);
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
    return <>{children}</> || null;
  }

  // Show ad unit
  return (
    <AdSenseUnit
      adSlot={adSlot}
      format={format}
      fullWidthResponsive={fullWidthResponsive}
      className={className}
      style={style}
    />
  );
}

