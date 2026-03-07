'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function AdsterraPopunder() {
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  // Check if user should see ads (not premium, has ads enabled)
  useEffect(() => {
    let cancelled = false;

    const checkAdEligibility = async () => {
      try {
        // Check user ad entitlement via API (premium / no-ads users are blocked)
        const res = await fetch('/api/ads/check');
        if (!res.ok) {
          console.error('[AdsterraPopunder] API error:', res.status, res.statusText);
          if (!cancelled) setCanShowAd(true); // Default to show on API error
          return;
        }
        
        const data = await res.json();
        console.log('[AdsterraPopunder] Ad check result:', data);

        if (!cancelled) {
          // Only render for users where the central ads gate says we *should* show.
          setCanShowAd(data.shouldShow === true);
        }
      } catch (error) {
        console.error('[AdsterraPopunder] Error checking ad eligibility:', error);
        // On any failure, default to showing ads (since we removed consent requirement)
        if (!cancelled) setCanShowAd(true);
      }
    };

    void checkAdEligibility();

    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render until we know if the user is allowed to see ads
  if (canShowAd === null) {
    return null; // Still loading
  }

  if (canShowAd !== true) {
    return null; // User is premium or has no-ads flag
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
