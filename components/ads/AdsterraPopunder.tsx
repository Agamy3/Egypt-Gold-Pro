'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function AdsterraPopunder() {
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);
  const isProd = process.env.NODE_ENV === 'production';

  // Check if user should see ads (not premium, has ads enabled)
  useEffect(() => {
    if (!isProd) {
      setCanShowAd(false);
      return;
    }

    let cancelled = false;

    const checkAdEligibility = async () => {
      try {
        // Check user ad entitlement via API (premium / no-ads users are blocked)
        const res = await fetch('/api/ads/check');
        const data = await res.json();

        if (!cancelled) {
          // Only render for users where the central ads gate says we *should* show.
          setCanShowAd(data.shouldShow === true);
        }
      } catch {
        // On any failure, err on the side of NOT showing ads.
        if (!cancelled) setCanShowAd(false);
      }
    };

    void checkAdEligibility();

    return () => {
      cancelled = true;
    };
  }, [isProd]);

  // Don't render in non-production
  if (!isProd) {
    return null;
  }

  // Don't render until we know if the user is allowed to see ads
  if (canShowAd !== true) {
    return null;
  }

  // Popunder script - placed in head as per Adsterra instructions
  return (
    <Script
      id="adsterra-popunder-c619c1965a129d3f44a409789974d977"
      strategy="afterInteractive"
      src="https://pl28866584.effectivegatecpm.com/c6/19/c1/c619c1965a129d3f44a409789974d977.js"
    />
  );
}
