'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLang } from '@/components/LanguageProvider';
import CountryCurrencySelector from '@/components/CountryCurrencySelector';
import LanguageToggle from '@/components/LanguageToggle';
import AccountMenu from '@/components/AccountMenu';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
}

export default function Header({ title, subtitle, showLogo = true }: HeaderProps) {
  const { lang } = useLang();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Default to collapsed (hidden)

  useEffect(() => {
    // Sync with sidebar state from localStorage
    const saved = localStorage.getItem('sidebarCollapsed');
    // If no saved state, default to collapsed (true)
    if (saved !== null) {
      setSidebarCollapsed(saved === '1');
    } else {
      localStorage.setItem('sidebarCollapsed', '1'); // Default to collapsed
    }

    // Listen for sidebar collapse changes
    const handleStorageChange = () => {
      const current = localStorage.getItem('sidebarCollapsed');
      setSidebarCollapsed(current === '1');
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen to custom event for same-tab updates
    const handleCustomEvent = () => {
      const current = localStorage.getItem('sidebarCollapsed');
      setSidebarCollapsed(current === '1');
    };
    window.addEventListener('sidebarToggle', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarToggle', handleCustomEvent);
    };
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState ? '1' : '0');
    // Dispatch custom event for same-tab sync
    window.dispatchEvent(new Event('sidebarToggle'));
  };

  return (
    <header className="bg-gray-900 shadow-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className={`flex flex-col sm:flex-row items-start sm:items-center ${lang === 'ar' ? 'sm:flex-row-reverse' : ''} gap-3 sm:gap-4 justify-between`}>
          <div className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {/* Hamburger toggle for sidebar (desktop) - always visible on desktop */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex items-center justify-center p-2 rounded-md text-gray-300 hover:bg-gray-800 transition-colors"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? (lang === 'ar' ? 'توسيع القائمة' : 'Expand sidebar') : (lang === 'ar' ? 'طي القائمة' : 'Collapse sidebar')}
            >
              <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {showLogo && (
              <Link href="/" className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                  <Image
                    src="/brand/logo.png"
                    alt="EgyptGold Pro"
                    fill
                    className="object-contain"
                    priority
                    sizes="(max-width: 640px) 48px, 56px"
                  />
                </div>
                {(title || !showLogo) && (
                  <div className="flex-1 min-w-0">
                    {title && (
                      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">{title}</h1>
                    )}
                    {subtitle && (
                      <p className="text-xs sm:text-sm text-gray-300 mt-1">{subtitle}</p>
                    )}
                  </div>
                )}
              </Link>
            )}
            {!showLogo && title && (
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">{title}</h1>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-gray-300 mt-1">{subtitle}</p>
                )}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-2 sm:gap-4 w-full sm:w-auto ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <CountryCurrencySelector />
            <LanguageToggle />
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

