/**
 * Cookie Preferences Link
 * 
 * Client component to reopen cookie consent banner
 */

'use client';

import { useState } from 'react';
import { useLang } from './LanguageProvider';

export default function CookiePreferencesLink() {
  const { lang } = useLang();
  const [showBanner, setShowBanner] = useState(false);

  const openPreferences = () => {
    // Clear consent to trigger banner
    document.cookie = 'cookie_consent=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    localStorage.removeItem('cookie_consent');
    
    // Trigger page reload to show banner
    window.location.reload();
  };

  return (
    <button
      onClick={openPreferences}
      className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
    >
      {lang === 'ar' ? 'تفضيلات ملفات تعريف الارتباط' : 'Cookie Preferences'}
    </button>
  );
}

