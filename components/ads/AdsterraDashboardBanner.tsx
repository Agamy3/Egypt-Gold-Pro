'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

const AD_CONTAINER_ID = 'container-90406b83691f68931250bf976163119d';

export default function AdsterraDashboardBanner() {
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  // Safety: always clear the container on mount so we don't
  // accidentally re-run the third-party script into a dirty node.
  useEffect(() => {
    const el = document.getElementById(AD_CONTAINER_ID);
    if (el) {
      el.innerHTML = '';
    }
  }, []);

  // Respect user ad entitlement (premium / no-ads users), but do NOT gate on cookie consent.
  useEffect(() => {
    let cancelled = false;

    const checkAdEligibility = async () => {
      try {
        // Ask the central ads API whether this user is allowed to see ads
        // (handles premium + "no ads" accounts).
        const res = await fetch('/api/ads/check');
        if (!res.ok) {
          console.error('[AdsterraDashboardBanner] API error:', res.status, res.statusText);
          if (!cancelled) setCanShowAd(true); // Default to show on API error
          return;
        }
        
        const data = await res.json();
        console.log('[AdsterraDashboardBanner] Ad check result:', data);

        if (!cancelled) {
          // Only render for users where the central ads gate says we *should* show.
          setCanShowAd(data.shouldShow === true);
        }
      } catch (error) {
        console.error('[AdsterraDashboardBanner] Error checking ad eligibility:', error);
        // On any failure, default to showing ads (since we removed consent requirement)
        if (!cancelled) setCanShowAd(true);
      }
    };

    void checkAdEligibility();

    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render until we know if the user is allowed to see ads.
  if (canShowAd === null) {
    return null; // Still loading
  }

  if (canShowAd !== true) {
    return null; // User is premium or has no-ads flag
  }

  return (
    <div className="w-full flex justify-center my-6">
      <div id={AD_CONTAINER_ID} />
      <Script
        id="adsterra-90406b83691f68931250bf976163119d"
        strategy="afterInteractive"
        async
        data-cfasync="false"
        src="https://pl28717029.effectivegatecpm.com/90406b83691f68931250bf976163119d/invoke.js"
      />
    </div>
  );
}

