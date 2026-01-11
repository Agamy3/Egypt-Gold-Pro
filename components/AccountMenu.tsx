'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client-auth';
import { useLang } from './LanguageProvider';

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

export default function AccountMenu() {
  const { lang } = useLang();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if environment variables are available
    // In client components, env vars starting with NEXT_PUBLIC_ are available at build time
    // If they're not set, they'll be undefined
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
      // If env vars are missing, just show sign in button (auth won't work but UI is visible)
      setLoading(false);
      return;
    }

    try {
      const supabase = createClientSupabaseClient();

      // Get initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }).catch((err) => {
        console.error('Error getting session:', err);
        setLoading(false);
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('Error initializing Supabase client:', error);
      setLoading(false);
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleSignOut = async () => {
    try {
      const supabase = createClientSupabaseClient();
      await supabase.auth.signOut();
      setShowMenu(false);
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
    );
  }

  if (!user) {
    return (
      <button
        onClick={() => router.push('/auth/signin')}
        className="px-3 py-1.5 text-sm font-medium text-gray-100 bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 transition-colors"
      >
        {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
      </button>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-800 transition-colors"
      >
        <div className="w-8 h-8 bg-gold-600 rounded-full flex items-center justify-center text-sm font-semibold text-gray-900">
          {initials}
        </div>
        <span className="hidden sm:block text-sm text-gray-300 truncate max-w-[120px]">
          {user.email}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${showMenu ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <div className={`absolute ${lang === 'ar' ? 'left-0' : 'right-0'} top-full mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-50`}>
          <div className="py-2">
            <div className="px-4 py-2 border-b border-gray-700">
              <div className="text-sm font-medium text-gray-100 truncate">{displayName}</div>
              <div className="text-xs text-gray-400 truncate">{user.email}</div>
            </div>
            <button
              onClick={() => {
                setShowMenu(false);
                router.push('/account/profile');
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {lang === 'ar' ? 'الملف الشخصي' : 'Profile'}
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                router.push('/account/notifications');
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
            </button>
            <div className="border-t border-gray-700 my-1" />
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
            >
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

