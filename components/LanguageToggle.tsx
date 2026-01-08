/**
 * Language Toggle Component
 * 
 * Toggle between English and Arabic
 */

'use client';

import { useLang } from './LanguageProvider';

export default function LanguageToggle() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center gap-1 rounded-md border border-gray-700 px-1 py-1 text-sm bg-gray-900">
      <button
        className={`px-2 py-1 rounded transition-colors ${
          lang === 'en'
            ? 'bg-blue-600 text-white font-semibold'
            : 'text-gray-300 hover:bg-gray-800'
        }`}
        onClick={() => setLang('en')}
        type="button"
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        className={`px-2 py-1 rounded transition-colors ${
          lang === 'ar'
            ? 'bg-blue-600 text-white font-semibold'
            : 'text-gray-300 hover:bg-gray-800'
        }`}
        onClick={() => setLang('ar')}
        type="button"
        aria-label="Switch to Arabic"
      >
        AR
      </button>
    </div>
  );
}

