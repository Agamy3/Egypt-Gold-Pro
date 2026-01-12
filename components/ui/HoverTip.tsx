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
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Track mouse position
  const handleMouseMove = (e: MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible && tooltipRef.current) {
      const tooltipEl = tooltipRef.current;
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.zIndex = '9999';
      
      // Position tooltip near cursor with offset
      const offset = 12; // Distance from cursor
      let tooltipX = mousePosition.x + offset;
      let tooltipY = mousePosition.y + offset;
      
      // Measure tooltip to adjust positioning
      setTimeout(() => {
        const tooltipRect = tooltipEl.getBoundingClientRect();
        
        // Adjust if it would go off screen right
        if (tooltipX + tooltipRect.width > window.innerWidth - 10) {
          tooltipX = mousePosition.x - tooltipRect.width - offset;
        }
        
        // Adjust if it would go off screen bottom
        if (tooltipY + tooltipRect.height > window.innerHeight - 10) {
          tooltipY = mousePosition.y - tooltipRect.height - offset;
        }
        
        // Adjust if it would go off screen left
        if (tooltipX < 10) {
          tooltipX = 10;
        }
        
        // Adjust if it would go off screen top
        if (tooltipY < 10) {
          tooltipY = 10;
        }
        
        tooltipEl.style.left = `${tooltipX}px`;
        tooltipEl.style.top = `${tooltipY}px`;
      }, 0);
    }
  }, [isVisible, mousePosition, side]);

  // Handle mobile touch events - show tooltip on tap for 3 seconds
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    setMousePosition({ x: touch.clientX, y: touch.clientY });
    setIsVisible(true);
    // Hide after 3 seconds on mobile
    setTimeout(() => setIsVisible(false), 3000);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    // Keep visible for a bit to allow reading
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card onClick from firing
    setMousePosition({ x: e.clientX, y: e.clientY });
    setIsVisible(!isVisible);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    setIsVisible(true);
  };

  return (
    <>
      <button
        type="button"
        ref={containerRef}
        className="inline-flex items-center gap-1 cursor-help focus:outline-none pointer-events-auto z-20"
        onMouseEnter={handleMouseEnter}
        onMouseMove={(e) => setMousePosition({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setIsVisible(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        tabIndex={0}
        aria-describedby="hover-tooltip"
        aria-label={text}
      >
        {children}
      </button>
      {isVisible && (
        <div
          ref={tooltipRef}
          id="hover-tooltip"
          className="fixed z-50 px-3 py-2 bg-gray-900 text-white text-xs sm:text-sm rounded-lg shadow-lg max-w-[90vw] sm:max-w-xs pointer-events-none break-words border border-gray-700"
          role="tooltip"
        >
          {text}
        </div>
      )}
    </>
  );
}
