/**
 * Ad Gate Client Component
 * 
 * Client-side wrapper for ad units (used in client components)
 */

/* eslint-disable @typescript-eslint/no-misused-promises */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdSenseUnit from './AdSenseUnit';
import AdLazyMount from './AdLazyMount';

interface AdGateClientProps {
  adSlot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Optional: how many meaningful content items are on the page
   * (e.g. cards, headlines, portfolio rows).
   *
   * Deprecated in favor of hasMeaningfulContent but kept for backwards
   * compatibility.
   */
  contentItemCount?: number;
  /**
   * Optional minimum content items required before rendering an ad.
   *
   * Deprecated in favor of hasMeaningfulContent but kept for backwards
   * compatibility.
   */
  minItems?: number;
  /**
   * Explicit signal from the page that content is meaningful and the
   * screen is no longer "thin".
   */
  hasMeaningfulContent?: boolean;
  /**
   * Whether to require scroll / viewport proximity (IntersectionObserver)
   * before mounting the underlying AdSense <ins> unit.
   *
   * Defaults to true.
   */
  requireScroll?: boolean;
}

// Centralized ad-blocking routes
const RESTRICTED_PREFIXES = ['/auth', '/account', '/admin'];
const RESTRICTED_EXACT = ['/premium', '/ads-debug', '/news'];

export default function AdGateClient({
  adSlot,
  format,
  fullWidthResponsive,
  className,
  style,
  contentItemCount,
  minItems,
  hasMeaningfulContent,
  requireScroll = true,
}: AdGateClientProps) {
  const pathname = usePathname() || '/';
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  const checkConsentAndUser = useCallback(async () => {
    try {
      // Hard block restricted routes
      const isRestrictedRoute =
        RESTRICTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
        RESTRICTED_EXACT.includes(pathname);

      if (isRestrictedRoute) {
        setCanShowAd(false);
        return;
      }

      // Check cookie consent from cookies or localStorage
      const cookieConsent = document.cookie
        .split('; ')
        .find((row) => row.startsWith('cookie_consent='))
        ?.split('=')[1];

      const localStorageConsent = window.localStorage.getItem('cookie_consent');
      const consent = cookieConsent || localStorageConsent;

      if (consent !== 'accepted') {
        setCanShowAd(false);
        return;
      }

      // If consent is given, check user type via API (premium / free / guest)
      const res = await fetch('/api/ads/check');
      const data = await res.json();
      setCanShowAd(data.shouldShow === true);
    } catch (error) {
      // On any failure, err on the side of *not* showing ads
      // to stay safely within AdSense policy.
      // eslint-disable-next-line no-console
      console.error('[AdGateClient] Error checking ad visibility:', error);
      setCanShowAd(false);
    }
  }, [pathname]);

  useEffect(() => {
    void checkConsentAndUser();
  }, [checkConsentAndUser]);

  useEffect(() => {
    // Listen for cookie_consent changes via localStorage events
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'cookie_consent') {
        void checkConsentAndUser();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [checkConsentAndUser]);

  // Loading state - don't render anything until we know the gate result
  if (canShowAd === null) {
    return null;
  }

  // Content threshold gate
  const contentReady = (() => {
    if (typeof hasMeaningfulContent === 'boolean') {
      return hasMeaningfulContent;
    }

    if (typeof contentItemCount !== 'number') return true;

    const threshold = minItems ?? 1;
    return contentItemCount >= threshold;
  })();

  // Don't show ad if user/consent gate failed or content is too thin
  if (!canShowAd || !contentReady) {
    return null;
  }

  const ad = (
    <AdSenseUnit
      adSlot={adSlot}
      format={format}
      fullWidthResponsive={fullWidthResponsive}
      className={className}
      style={style}
    />
  );

  if (!requireScroll) {
    return ad;
  }

  return <AdLazyMount>{ad}</AdLazyMount>;
}



