/**
 * Ad Gate Client Component
 * 
 * Client-side wrapper for ad units (used in client components)
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdSenseUnit from './AdSenseUnit';

interface AdGateClientProps {
  adSlot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Optional: how many meaningful content items are on the page
   * (e.g. cards, headlines, portfolio rows).
   */
  contentItemCount?: number;
  /**
   * Optional minimum content items required before rendering an ad.
   */
  minItems?: number;
}

const RESTRICTED_PREFIXES = ['/auth', '/account', '/admin'];
const RESTRICTED_EXACT = ['/premium', '/ads-debug'];

export default function AdGateClient({
  adSlot,
  format,
  fullWidthResponsive,
  className,
  style,
  contentItemCount,
  minItems,
}: AdGateClientProps) {
  const pathname = usePathname() || '/';
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  useEffect(() => {
    const isRestrictedRoute =
      RESTRICTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      RESTRICTED_EXACT.includes(pathname);

    // Never show ads on restricted routes
    if (isRestrictedRoute) {
      setCanShowAd(false);
      return;
    }

    const checkConsentAndUser = () => {
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

      // If consent is given, check user type via API (premium / free / guest)
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

    checkConsentAndUser();

    // Re-check periodically so that changing cookie preferences or auth
    // can hide ads quickly without a full reload
    const interval = setInterval(checkConsentAndUser, 2000);
    return () => clearInterval(interval);
  }, [pathname]);

  // Loading state - don't render anything until we know the gate result
  if (canShowAd === null) {
    return null;
  }

  // Content threshold gate
  const contentReady = (() => {
    if (typeof contentItemCount !== 'number') return true;
    const threshold = minItems ?? 1;
    return contentItemCount >= threshold;
  })();

  // Don't show ad if user/consent gate failed or content is too thin
  if (!canShowAd || !contentReady) {
    return null;
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


