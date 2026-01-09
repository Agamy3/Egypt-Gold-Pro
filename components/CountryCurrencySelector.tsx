'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from './LanguageProvider';
import { useEffect, useState, Suspense } from 'react';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

const COUNTRY_LABELS: Record<Country, { en: string; ar: string }> = {
  EG: { en: 'Egypt', ar: 'مصر' },
  AE: { en: 'UAE', ar: 'الإمارات' },
  SA: { en: 'Saudi', ar: 'السعودية' },
  US: { en: 'USA', ar: 'الولايات المتحدة' },
};

const CURRENCY_LABELS: Record<Currency, string> = {
  EGP: 'EGP',
  USD: 'USD',
  AED: 'AED',
  SAR: 'SAR',
};

function CountryCurrencySelectorContent() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRTL = lang === 'ar';
  
  // Get initial values from URL params or use defaults
  const [country, setCountry] = useState<Country>(
    (searchParams.get('country') as Country) || 'EG'
  );
  const [currency, setCurrency] = useState<Currency>(
    (searchParams.get('currency') as Currency) || 'EGP'
  );

  // Sync with URL params on mount
  useEffect(() => {
    const urlCountry = searchParams.get('country') as Country;
    const urlCurrency = searchParams.get('currency') as Currency;
    
    if (urlCountry && ['EG', 'AE', 'SA', 'US'].includes(urlCountry)) {
      setCountry(urlCountry);
    }
    if (urlCurrency && ['EGP', 'USD', 'AED', 'SAR'].includes(urlCurrency)) {
      setCurrency(urlCurrency);
    }
  }, [searchParams]);

  const handleCountryChange = (newCountry: Country) => {
    setCountry(newCountry);
    // Update URL without page reload
    const params = new URLSearchParams(searchParams.toString());
    params.set('country', newCountry);
    // Optionally set default currency for country
    if (newCountry === 'EG') params.set('currency', currency === 'AED' || currency === 'SAR' ? 'EGP' : currency);
    else if (newCountry === 'AE') params.set('currency', currency === 'EGP' || currency === 'SAR' ? 'AED' : currency);
    else if (newCountry === 'SA') params.set('currency', currency === 'EGP' || currency === 'AED' ? 'SAR' : currency);
    else if (newCountry === 'US') params.set('currency', 'USD');
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleCurrencyChange = (newCurrency: Currency) => {
    setCurrency(newCurrency);
    // Update URL without page reload
    const params = new URLSearchParams(searchParams.toString());
    params.set('currency', newCurrency);
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className="flex items-center gap-2">
        <label className={`text-xs text-gray-400 ${isRTL ? 'text-right' : ''}`}>
          {isRTL ? 'البلد' : 'Country'}
        </label>
        <select
          value={country}
          onChange={(e) => handleCountryChange(e.target.value as Country)}
          className="px-3 py-1.5 border border-gray-700 bg-gray-800 text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
        >
          <option value="EG">{COUNTRY_LABELS.EG[lang]}</option>
          <option value="AE">{COUNTRY_LABELS.AE[lang]}</option>
          <option value="SA">{COUNTRY_LABELS.SA[lang]}</option>
          <option value="US">{COUNTRY_LABELS.US[lang]}</option>
        </select>
      </div>
      
      <div className="flex items-center gap-2">
        <label className={`text-xs text-gray-400 ${isRTL ? 'text-right' : ''}`}>
          {isRTL ? 'العملة' : 'Currency'}
        </label>
        <select
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
          className="px-3 py-1.5 border border-gray-700 bg-gray-800 text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[80px]"
        >
          <option value="EGP">EGP</option>
          <option value="USD">USD</option>
          <option value="AED">AED</option>
          <option value="SAR">SAR</option>
        </select>
      </div>
    </div>
  );
}

export default function CountryCurrencySelector() {
  return (
    <Suspense fallback={<div className="w-[200px] h-[40px] bg-gray-800 rounded animate-pulse" />}>
      <CountryCurrencySelectorContent />
    </Suspense>
  );
}

