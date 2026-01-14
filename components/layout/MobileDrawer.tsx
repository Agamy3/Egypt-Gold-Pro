'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider';

interface NavItem {
  href: string;
  labelEn: string;
  labelAr: string;
}

export default function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname() || '/';
  const { lang } = useLang();
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    // Close drawer on route change
    setOpen(false);
  }, [pathname]);

  // Close drawer on Esc key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    fetch('/api/user/is-admin')
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const navItems: NavItem[] = [
    { href: '/', labelEn: 'Dashboard', labelAr: 'الرئيسية' },
    { href: '/news', labelEn: 'News', labelAr: 'الأخبار' },
    { href: '/portfolio', labelEn: 'Portfolio', labelAr: 'المحفظة' },
    { href: '/premium', labelEn: 'Premium', labelAr: 'مميز' },
    { href: '/account/profile', labelEn: 'Profile', labelAr: 'الملف الشخصي' },
    { href: '/account/notifications', labelEn: 'Notifications', labelAr: 'الإشعارات' },
  ];

  if (isAdmin) {
    navItems.push(
      { href: '/admin/coupons', labelEn: 'Coupons', labelAr: 'الكوبونات' },
      { href: '/admin/premium-requests', labelEn: 'Premium Requests', labelAr: 'طلبات المميز' },
    );
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold-500 focus:ring-offset-black"
        aria-label="Open navigation"
      >
        <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-black border-r border-gray-900 shadow-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
                  {logoError ? (
                    <span className="text-gold-400 font-bold text-sm">EGP</span>
                  ) : (
                    <Image
                      src="/brand/logo.png"
                      alt="EgyptGold Pro"
                      fill
                      className="object-contain"
                      priority
                      sizes="32px"
                      onError={() => setLogoError(true)}
                    />
                  )}
                </div>
                <span className="text-sm font-semibold text-gold-400">
                  {lang === 'ar' ? 'EgyptGold Pro' : 'EgyptGold Pro'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-gray-900 text-gray-400 transition-colors"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-3 py-2 rounded-md text-sm font-medium ${
                      active
                        ? 'bg-gray-900 text-gold-300'
                        : 'text-gray-300 hover:bg-gray-900 hover:text-gold-200'
                    }`}
                  >
                    {lang === 'ar' ? item.labelAr : item.labelEn}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}


