'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface AdLazyMountProps {
  children: React.ReactNode;
}

/**
 * AdLazyMount
 *
 * - Uses IntersectionObserver to delay mounting ad children until the
 *   placeholder is within 600px of the viewport.
 * - If IntersectionObserver is not available, falls back to a 2s delay
 *   **only** on dashboard (`/`) and portfolio (`/portfolio`) routes.
 */
export default function AdLazyMount({ children }: AdLazyMountProps) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname() || '/';

  useEffect(() => {
    if (visible) return;

    // Prefer IntersectionObserver when available
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              setVisible(true);
              observer.disconnect();
            }
          });
        },
        {
          root: null,
          rootMargin: '600px 0px 600px 0px',
          threshold: 0.01,
        }
      );

      if (placeholderRef.current) {
        observer.observe(placeholderRef.current);
      }

      return () => {
        observer.disconnect();
      };
    }

    // Fallback: delay render by 2s ONLY on dashboard/portfolio
    const isDashboard = pathname === '/';
    const isPortfolio = pathname.startsWith('/portfolio');

    if (!isDashboard && !isPortfolio) {
      // On other routes, never render ads if we can't safely lazy-load
      return;
    }

    const timeoutId = setTimeout(() => {
      setVisible(true);
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pathname, visible]);

  // Until visible, render only a lightweight placeholder div so that
  // AdSense <ins> never mounts on thin-content screens.
  if (!visible) {
    return <div ref={placeholderRef} aria-hidden="true" />;
  }

  return <>{children}</>;
}


