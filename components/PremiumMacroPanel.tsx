/**
 * Premium Macro Panel Component
 * 
 * Shows Advanced Macro & Gold Signals for premium users
 * Shows locked CTA for free users
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLang } from './LanguageProvider';

interface PremiumMacroPanelProps {
  isPremium: boolean;
  lang: 'en' | 'ar';
}

export default function PremiumMacroPanel({ isPremium, lang }: PremiumMacroPanelProps) {
  if (!isPremium) {
    return (
      <div className={`bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-700 relative overflow-hidden`}>
        {/* Locked overlay pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)'
        }} />
        
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold text-gray-400 inline-flex items-center gap-2 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              {lang === 'ar' ? 'إشارات الماكرو والذهب المتقدمة (مميز)' : 'Advanced Macro & Gold Signals (Premium)'}
            </h2>
          </div>
          
          <p className="text-gray-500 mb-6 text-sm">
            {lang === 'ar' 
              ? 'افهم سبب تحرك الذهب - وليس فقط السعر.'
              : 'Understand why gold moves — not just the price.'}
          </p>
          
          <Link
            href="/premium"
            className="inline-flex items-center px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold transition-colors"
          >
            {lang === 'ar' ? 'ترقية إلى مميز' : 'Upgrade to Premium'}
          </Link>
        </div>
      </div>
    );
  }

  // Premium content
  return (
    <div className={`bg-gradient-to-br from-gold-900/30 to-gold-800/20 rounded-lg shadow-md p-4 sm:p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gold-500`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-lg font-semibold text-white inline-flex items-center gap-2 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          <span className="px-2 py-1 bg-gold-600 text-white text-xs font-semibold rounded">
            {lang === 'ar' ? 'إشارة' : 'SIGNAL'}
          </span>
          {lang === 'ar' ? 'إشارات الماكرو والذهب المتقدمة' : 'Advanced Macro & Gold Signals'}
        </h2>
      </div>
      
      <div className="space-y-4">
        <div>
          <h3 className={`text-sm font-semibold text-gray-300 mb-2 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'لماذا يهم هذا:' : 'Why this matters:'}
          </h3>
          <p className={`text-sm text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar'
              ? 'تتحرك أسعار الذهب استجابة لعوامل الماكرو مثل أسعار الفائدة والضغوط التضخمية وقوة العملة. تتيح لك الإشارات المتقدمة فهم السياق الأوسع وراء تحركات الأسعار.'
              : 'Gold prices move in response to macro factors like interest rates, inflationary pressures, and currency strength. Advanced signals help you understand the broader context behind price movements.'}
          </p>
        </div>
        
        <div className="pt-4 border-t border-gray-700">
          <p className={`text-xs text-gray-500 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar'
              ? 'المحتوى المتقدم متاح فقط للأعضاء المميزين.'
              : 'Advanced content available to premium members only.'}
          </p>
        </div>
      </div>
    </div>
  );
}

