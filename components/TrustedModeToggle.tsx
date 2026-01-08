'use client';

import { useEffect, useState } from 'react';
import { useLang } from './LanguageProvider';
import { t } from '@/lib/i18n';

interface TrustedModeToggleProps {
  onToggle?: (enabled: boolean) => void;
}

export default function TrustedModeToggle({ onToggle }: TrustedModeToggleProps) {
  const { lang } = useLang();
  const [trustedMode, setTrustedMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for user preference
    const stored = localStorage.getItem('egyptTrustedOnlyMode');
    if (stored !== null) {
      const enabled = stored === 'true';
      setTrustedMode(enabled);
    } else {
      // Default: check if env var suggests it's enabled (server-side default)
      // For client-side, we'll default to false (normal mode)
      setTrustedMode(false);
    }
    setLoading(false);
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setTrustedMode(enabled);
    localStorage.setItem('egyptTrustedOnlyMode', enabled.toString());
    
    // Trigger a page refresh to apply the change
    // Or call onToggle callback if provided
    if (onToggle) {
      onToggle(enabled);
    } else {
      // Reload the page to apply changes
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700 shadow-sm ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
      <div className="flex-1">
        <div className={`text-sm font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
          {t(lang, 'sourceMode')}
        </div>
        <div className={`text-xs text-gray-300 mt-0.5 ${lang === 'ar' ? 'text-right' : ''}`}>
          {trustedMode 
            ? t(lang, 'trustedOnly')
            : t(lang, 'allSources')}
        </div>
      </div>
      <button
        onClick={() => handleToggle(!trustedMode)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 ${
          trustedMode ? 'bg-gold-600' : 'bg-gray-300'
        }`}
        role="switch"
        aria-checked={trustedMode}
        aria-label="Toggle trusted-only mode"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            trustedMode ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {trustedMode && (
        <div className={`text-xs text-amber-600 font-medium ${lang === 'ar' ? 'text-right' : ''}`}>
          ⚠️ {lang === 'ar' ? 'مصدر واحد' : 'Single Source'}
        </div>
      )}
    </div>
  );
}

