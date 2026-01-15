'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLang } from '@/components/LanguageProvider';

interface NavItem {
  href: string;
  labelEn: string;
  labelAr: string;
  icon: React.ReactNode;
}

function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export default function Sidebar() {
  const pathname = usePathname() || '/';
  const { lang } = useLang();
  const [collapsed, setCollapsed] = useState(true); // Default to collapsed (hidden)
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentCountry, setCurrentCountry] = useState<string | null>(null);

  // Load collapsed state from localStorage on mount and listen for changes
  useEffect(() => {
    const updateCollapsed = () => {
      const saved = localStorage.getItem('sidebarCollapsed');
      // If no saved state, default to collapsed (true)
      if (saved !== null) {
        setCollapsed(saved === '1');
      } else {
        setCollapsed(true); // Default to collapsed
        localStorage.setItem('sidebarCollapsed', '1');
      }
    };

    // Initial load
    updateCollapsed();

    // Listen for changes from Header button
    window.addEventListener('sidebarToggle', updateCollapsed);
    window.addEventListener('storage', updateCollapsed);

    return () => {
      window.removeEventListener('sidebarToggle', updateCollapsed);
      window.removeEventListener('storage', updateCollapsed);
    };
  }, []);

  useEffect(() => {
    // Check admin status for admin links
    fetch('/api/user/is-admin')
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  // Get country from URL on client side - update when pathname or URL changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const updateCountry = () => {
        // Check if we're on /us page (US country)
        if (pathname === '/us') {
          setCurrentCountry('US');
          return;
        }
        
        // Otherwise, read from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const country = urlParams.get('country');
        setCurrentCountry(country);
      };
      
      // Initial read
      updateCountry();
      
      // Listen for URL changes (Next.js router events)
      const handleRouteChange = () => {
        // Small delay to ensure URL is updated
        setTimeout(updateCountry, 100);
      };
      
      window.addEventListener('popstate', handleRouteChange);
      
      // Also check periodically (fallback for programmatic navigation)
      const interval = setInterval(updateCountry, 500);
      
      return () => {
        window.removeEventListener('popstate', handleRouteChange);
        clearInterval(interval);
      };
    }
  }, [pathname]);

  const navItems: NavItem[] = [
    {
      href: '/',
      labelEn: 'Dashboard',
      labelAr: 'الرئيسية',
      icon: <span>📊</span>,
    },
    {
      href: '/news',
      labelEn: 'News',
      labelAr: 'الأخبار',
      icon: <span>📰</span>,
    },
    {
      href: '/portfolio',
      labelEn: 'Portfolio',
      labelAr: 'المحفظة',
      icon: <span>💰</span>,
    },
    {
      href: '/premium',
      labelEn: 'Premium',
      labelAr: 'مميز',
      icon: <span>⭐</span>,
    },
    {
      href: '/account/profile',
      labelEn: 'Profile',
      labelAr: 'الملف الشخصي',
      icon: <span>👤</span>,
    },
    {
      href: '/account/notifications',
      labelEn: 'Notifications',
      labelAr: 'الإشعارات',
      icon: <span>🔔</span>,
    },
  ];

  const adminItems: NavItem[] = isAdmin
    ? [
        {
          href: '/admin/coupons',
          labelEn: 'Coupons',
          labelAr: 'الكوبونات',
          icon: <span>🏷️</span>,
        },
        {
          href: '/admin/premium-requests',
          labelEn: 'Premium Requests',
          labelAr: 'طلبات المميز',
          icon: <span>🛠️</span>,
        },
        {
          href: '/admin/news',
          labelEn: 'News Admin',
          labelAr: 'إدارة الأخبار',
          icon: <span>📰</span>,
        },
      ]
    : [];

  const allItems = [...navItems, ...adminItems];

  // Don't render if collapsed (hidden)
  if (collapsed) {
    return null;
  }

  return (
    <aside 
      className={classNames(
        'hidden lg:flex lg:flex-col bg-black border-r border-gray-900 transition-all duration-300',
        'w-56 xl:w-64'
      )}
    >
      <div className="flex-1 flex flex-col py-4">
        <nav className="flex-1 px-2 space-y-1">
          {allItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            // Preserve country parameter when navigating to /news
            const href = item.href === '/news' && currentCountry
              ? `/news?country=${currentCountry}`
              : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                className={classNames(
                  'group flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-gray-900 text-gold-300'
                    : 'text-gray-300 hover:bg-gray-900 hover:text-gold-200'
                )}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <span className="truncate">
                  {lang === 'ar' ? item.labelAr : item.labelEn}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}


