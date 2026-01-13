/**
 * Google AdSense Ad Unit Component
 * 
 * Renders a single AdSense ad unit with proper initialization
 * Safe for App Router with SSR/hydration
 */

'use client';

import { useEffect, useRef } from 'react';

interface AdSenseUnitProps {
  adSlot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export default function AdSenseUnit({
  adSlot,
  format = 'auto',
  fullWidthResponsive = true,
  className = '',
  style = { display: 'block' },
}: AdSenseUnitProps) {
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate pushes for the same element
    if (pushedRef.current) return;
    
    // Check if already initialized (via data-adsbygoogle-status attribute)
    if (insRef.current?.getAttribute('data-adsbygoogle-status')) {
      pushedRef.current = true;
      return;
    }

    // Initialize ad when script is available
    const initAd = () => {
      try {
        if (typeof window !== 'undefined' && window.adsbygoogle && insRef.current) {
          // Mark as initialized before pushing
          insRef.current.setAttribute('data-adsbygoogle-status', 'initialized');
          
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
          pushedRef.current = true;
        }
      } catch (error) {
        // Log error in dev only
        if (process.env.NODE_ENV === 'development') {
          console.error('[AdSenseUnit] Error initializing ad:', error);
        }
      }
    };

    // Try immediately if script is already loaded
    if (typeof window !== 'undefined' && window.adsbygoogle) {
      initAd();
    } else {
      // Wait for script to load (check every 100ms, timeout after 5s)
      let attempts = 0;
      const maxAttempts = 50;
      
      const checkInterval = setInterval(() => {
        attempts++;
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          initAd();
          clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    }
  }, [adSlot]); // Re-run if slot changes

  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-1715676389323573';

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className}`}
      style={style}
      data-ad-client={clientId}
      data-ad-slot={adSlot}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
    />
  );
}

