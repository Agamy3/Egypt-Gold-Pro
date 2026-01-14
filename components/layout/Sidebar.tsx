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
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check admin status for admin links
    fetch('/api/user/is-admin')
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

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
      ]
    : [];

  const allItems = [...navItems, ...adminItems];

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-56 xl:w-64 bg-black border-r border-gray-900">
      <div className="flex-1 flex flex-col py-4">
        <div className="flex items-center justify-between px-4 mb-4">
          <span className="text-sm font-semibold text-gold-400 truncate">
            {lang === 'ar' ? 'EgyptGold Pro' : 'EgyptGold Pro'}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 rounded-md hover:bg-gray-900 text-gray-400"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {allItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={classNames(
                  'group flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-gray-900 text-gold-300'
                    : 'text-gray-300 hover:bg-gray-900 hover:text-gold-200'
                )}
              >
                <span className="text-base">{item.icon}</span>
                {!collapsed && (
                  <span className="truncate">
                    {lang === 'ar' ? item.labelAr : item.labelEn}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}


