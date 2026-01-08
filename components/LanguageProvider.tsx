/**
 * Language Provider
 * 
 * Manages language state and applies RTL/LTR direction
 */

'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Lang } from '@/lib/i18n';

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

function applyToHtml(lang: Lang) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    // Load initial language from URL or localStorage
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    const urlLang = url.searchParams.get('lang') as Lang | null;
    const stored = localStorage.getItem('egp_lang') as Lang | null;
    
    let initial: Lang = 'en';
    if (urlLang === 'ar' || urlLang === 'en') {
      initial = urlLang;
    } else if (stored === 'ar' || stored === 'en') {
      initial = stored;
    }
    
    setLangState(initial);
    applyToHtml(initial);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('egp_lang', l);
    applyToHtml(l);

    // Keep URL in sync without reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', l);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for SSR or if used outside provider
    return { lang: 'en' as Lang, setLang: () => {} };
  }
  return ctx;
}


