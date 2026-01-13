/**
 * Google AdSense Ad Component
 * 
 * Renders a single AdSense ad unit
 * Safe for App Router with SSR/hydration
 */

'use client';

import { useEffect, useRef } from 'react';

interface AdsenseAdProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export default function AdsenseAd({
  slot,
  format = 'auto',
  className = '',
}: AdsenseAdProps) {
  const pushedRef = useRef(false);
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    // Prevent duplicate pushes
    if (pushedRef.current) return;

    // Wait for adsbygoogle script to load
    const initAd = () => {
      try {
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
          pushedRef.current = true;
        }
      } catch (error) {
        console.error('[AdsenseAd] Error initializing ad:', error);
      }
    };

    // Try immediately if script is already loaded
    if (typeof window !== 'undefined' && window.adsbygoogle) {
      initAd();
    } else {
      // Wait for script to load
      const checkInterval = setInterval(() => {
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          initAd();
          clearInterval(checkInterval);
        }
      }, 100);

      // Cleanup after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 5000);
    }
  }, []);

  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-1715676389323573';

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className}`}
      style={{ display: 'block' }}
      data-ad-client={clientId}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}

