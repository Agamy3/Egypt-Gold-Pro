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
 * - If IntersectionObserver is not available, we DO NOT mount ad children.
 *   (This prevents any chance of ads showing on thin content / bot-rendered screens.)
 */
export default function AdLazyMount({ children }: AdLazyMountProps) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  usePathname(); // keep hook subscription stable (future-proof), value not needed

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

    // No IntersectionObserver => never mount ads
    return;
  }, [visible]);

  // Until visible, render only a lightweight placeholder div so that
  // AdSense <ins> never mounts on thin-content screens.
  if (!visible) {
    return <div ref={placeholderRef} aria-hidden="true" />;
  }

  return <>{children}</>;
}


