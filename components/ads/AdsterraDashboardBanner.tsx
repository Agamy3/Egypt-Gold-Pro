'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

const AD_CONTAINER_ID = 'container-90406b83691f68931250bf976163119d';

export default function AdsterraDashboardBanner() {
  const isProd = process.env.NODE_ENV === 'production';
  const [canShowAd, setCanShowAd] = useState<boolean | null>(null);

  // Safety: always clear the container on mount in production so we don't
  // accidentally re-run the third-party script into a dirty node.
  useEffect(() => {
    if (!isProd) return;
    const el = document.getElementById(AD_CONTAINER_ID);
    if (el) {
      el.innerHTML = '';
    }
  }, [isProd]);

  // Respect user ad entitlement (premium / no-ads users), but do NOT gate on cookie consent.
  useEffect(() => {
    if (!isProd) {
      setCanShowAd(false);
      return;
    }

    let cancelled = false;

    const checkAdEligibility = async () => {
      try {
        // Ask the central ads API whether this user is allowed to see ads
        // (handles premium + "no ads" accounts).
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

  if (!isProd) {
    return null;
  }

  // Don't render until we know if the user is allowed to see ads.
  if (canShowAd !== true) {
    return null;
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

