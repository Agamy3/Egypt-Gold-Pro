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
import { isPageContentEligible, isRouteAdEligible, shouldRenderAdUnit } from '@/lib/ads/adPolicy';

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
   * Visible publisher text length for the page (computed by the page from data).
   * DO NOT compute by scraping the DOM.
   */
  textLength?: number;
  /**
   * Whether to require scroll / viewport proximity (IntersectionObserver)
   * before mounting the underlying AdSense <ins> unit.
   *
   * Defaults to true.
   */
  requireScroll?: boolean;
}

export default function AdGateClient({
  adSlot,
  format,
  fullWidthResponsive,
  className,
  style,
  contentItemCount,
  minItems,
  hasMeaningfulContent,
  textLength,
  requireScroll = true,
}: AdGateClientProps) {
  const pathname = usePathname() || '/';
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  const derivedMeaningful =
    typeof hasMeaningfulContent === 'boolean'
      ? hasMeaningfulContent
      : typeof contentItemCount === 'number'
        ? contentItemCount >= (minItems ?? 1)
        : false;

  const tLen = typeof textLength === 'number' ? textLength : 0;

  const checkConsentAndUser = useCallback(async () => {
    try {
      // Fast pre-gate: if route/content is not eligible, don't even check consent/user.
      if (!isRouteAdEligible(pathname) || !isPageContentEligible({ textLength: tLen, hasMeaningfulContent: derivedMeaningful })) {
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

  const eligible = shouldRenderAdUnit({
    pathname,
    textLength: tLen,
    hasMeaningfulContent: derivedMeaningful,
    isClient: true,
    hasUserConsented: canShowAd,
  });

  if (!eligible) {
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



