'use client';

import React, { useMemo, useState } from 'react';

import { useLang } from '@/components/LanguageProvider';

type Karat = 24 | 22 | 21 | 18 | 14;

const KARAT_PURITY: Record<Karat, number> = {
  24: 1.0,   // 100% pure
  22: 22 / 24, // 91.67%
  21: 21 / 24, // 87.5%
  18: 18 / 24, // 75%
  14: 14 / 24, // 58.33%
};

function clampNum(x: string): number {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function convertKarat(grams: number, fromKarat: Karat, toKarat: Karat): number {
  if (grams <= 0 || fromKarat === toKarat) return grams;
  // Pure gold content = grams * purity
  // To get equivalent in different karat: result = (pure gold) / (target purity)
  const pureGold = grams * KARAT_PURITY[fromKarat];
  return pureGold / KARAT_PURITY[toKarat];
}

export default function GoldConverter(props: {
  country: 'EG' | 'AE' | 'SA' | 'US';
  defaultKarat?: Karat;
  availableKarats?: Karat[];
}) {
  const { lang } = useLang();
  const [inputKarat, setInputKarat] = useState<Karat>(props.defaultKarat ?? 24);
  const [outputKarat, setOutputKarat] = useState<Karat>(21);
  const [inputGrams, setInputGrams] = useState<string>('10');

  const availableKarats = useMemo(() => {
    const base: Karat[] = props.availableKarats && props.availableKarats.length > 0 
      ? props.availableKarats 
      : [24, 22, 21, 18, 14];
    return Array.from(new Set(base)).sort((a, b) => b - a) as Karat[];
  }, [props.availableKarats]);

  const inputGramsNum = clampNum(inputGrams);
  const outputGrams = useMemo(() => {
    if (inputGramsNum <= 0) return 0;
    return convertKarat(inputGramsNum, inputKarat, outputKarat);
  }, [inputGramsNum, inputKarat, outputKarat]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-base font-semibold text-gray-100">
            {lang === 'ar' ? 'محول ذهب-إلى-ذهب' : 'Gold-to-Gold Converter'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {lang === 'ar'
              ? 'تحويل بين العيارات المختلفة بناءً على نقاء الذهب.'
              : 'Convert between different karats based on gold purity.'}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Input Section */}
        <div className="rounded-md border border-gray-800 bg-gray-900/30 p-4">
          <div className="text-xs text-gray-400 mb-2">{lang === 'ar' ? 'المدخل' : 'Input'}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              className="flex-1 min-w-[120px] bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-gold-500"
              type="number"
              inputMode="decimal"
              value={inputGrams}
              onChange={(e) => setInputGrams(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
            />
            <span className="text-sm text-gray-300 whitespace-nowrap">{lang === 'ar' ? 'جرام' : 'grams'}</span>
            <span className="text-sm text-gray-500">of</span>
            <select
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-gold-500"
              value={inputKarat}
              onChange={(e) => setInputKarat(Number(e.target.value) as Karat)}
            >
              {availableKarats.map((k) => (
                <option key={k} value={k}>
                  {k}K
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {lang === 'ar' 
              ? `نقاء ${inputKarat}K: ${(KARAT_PURITY[inputKarat] * 100).toFixed(2)}%`
              : `${inputKarat}K purity: ${(KARAT_PURITY[inputKarat] * 100).toFixed(2)}%`}
          </div>
        </div>

        {/* Conversion Arrow */}
        <div className="flex items-center justify-center">
          <div className="text-2xl text-gray-500">↓</div>
        </div>

        {/* Output Section */}
        <div className="rounded-md border border-gray-800 bg-gray-900/30 p-4">
          <div className="text-xs text-gray-400 mb-2">{lang === 'ar' ? 'المخرج' : 'Output'}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 font-mono">
              {outputGrams > 0 ? outputGrams.toFixed(4) : '0.0000'}
            </div>
            <span className="text-sm text-gray-300 whitespace-nowrap">{lang === 'ar' ? 'جرام' : 'grams'}</span>
            <span className="text-sm text-gray-500">of</span>
            <select
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-gold-500"
              value={outputKarat}
              onChange={(e) => setOutputKarat(Number(e.target.value) as Karat)}
            >
              {availableKarats.map((k) => (
                <option key={k} value={k}>
                  {k}K
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {lang === 'ar' 
              ? `نقاء ${outputKarat}K: ${(KARAT_PURITY[outputKarat] * 100).toFixed(2)}%`
              : `${outputKarat}K purity: ${(KARAT_PURITY[outputKarat] * 100).toFixed(2)}%`}
          </div>
        </div>

        {/* Conversion Formula Display */}
        {inputGramsNum > 0 && inputKarat !== outputKarat && (
          <div className="mt-3 p-3 bg-gray-900/50 border border-gray-800 rounded text-xs text-gray-400">
            <div className="font-mono">
              {inputGramsNum.toFixed(4)}g × {inputKarat}/24 ÷ {outputKarat}/24 = {outputGrams.toFixed(4)}g
            </div>
            <div className="mt-1">
              {lang === 'ar'
                ? `يعادل ${inputGramsNum.toFixed(2)} جرام من ${inputKarat}K نفس كمية الذهب الخالص في ${outputGrams.toFixed(2)} جرام من ${outputKarat}K`
                : `${inputGramsNum.toFixed(2)}g of ${inputKarat}K contains the same pure gold as ${outputGrams.toFixed(2)}g of ${outputKarat}K`}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-[11px] text-gray-500">
        {lang === 'ar'
          ? 'تنبيه: هذا المحول يحسب فقط نقاء الذهب. الأسعار الفعلية قد تختلف حسب السوق والرسوم.'
          : 'Note: This converter calculates gold purity only. Actual prices may vary by market and fees.'}
      </div>
    </div>
  );
}
