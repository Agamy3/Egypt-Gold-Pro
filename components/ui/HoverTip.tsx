/**
 * Hover Tooltip Component
 * 
 * Shows a tooltip on hover/focus for accessible information
 */

'use client';

import { useState, useRef, useEffect } from 'react';

interface HoverTipProps {
  text: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export default function HoverTip({ text, children, side = 'bottom' }: HoverTipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && containerRef.current && tooltipRef.current) {
      const container = containerRef.current.getBoundingClientRect();
      
      // Position tooltip based on side
      const tooltipEl = tooltipRef.current;
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.zIndex = '9999';
      
      // Simple positioning - show below by default, adjust if needed
      tooltipEl.style.top = `${container.bottom + 8}px`;
      tooltipEl.style.left = `${container.left}px`;
      tooltipEl.style.transform = 'none';
      
      // Measure tooltip to adjust positioning
      setTimeout(() => {
        const tooltipRect = tooltipEl.getBoundingClientRect();
        
        // Adjust if it would go off screen right
        if (tooltipRect.right > window.innerWidth - 10) {
          tooltipEl.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
        }
        
        // Adjust if it would go off screen bottom
        if (tooltipRect.bottom > window.innerHeight - 10) {
          // Show above instead
          tooltipEl.style.top = `${container.top - tooltipRect.height - 8}px`;
        }
        
        // Adjust if it would go off screen left
        if (tooltipRect.left < 10) {
          tooltipEl.style.left = '10px';
        }
      }, 0);
    }
  }, [isVisible, side]);

  return (
    <>
      <span
        ref={containerRef}
        className="inline-flex items-center gap-1 cursor-help"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        tabIndex={0}
        aria-describedby="hover-tooltip"
      >
        {children}
      </span>
      {isVisible && (
        <div
          ref={tooltipRef}
          id="hover-tooltip"
          className="fixed z-50 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg max-w-xs pointer-events-none"
          role="tooltip"
        >
          {text}
        </div>
      )}
    </>
  );
}
