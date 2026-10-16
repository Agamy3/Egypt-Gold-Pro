'use client';

import { startVisiblePolling } from '@/lib/client/visible-polling.mjs';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useLang } from '@/components/LanguageProvider';
import ConfidenceRing from '@/components/ConfidenceRing';

type Country = 'GLOBAL' | 'EG';
type Action = 'BUY' | 'SELL' | 'HOLD';
type RiskRegime = 'calm' | 'elevated' | 'volatile' | 'crisis';
type Decision = 'approved' | 'downgraded_to_hold' | 'overridden' | 'fallback_algo';

type LatestSignal = {
  cycle_key: string;
  cycle_started_at: string;
  country: Country;
  action: Action; // raw (legacy)
  confidence: number; // raw (legacy)
  raw_action?: Action | null;
  raw_confidence0to1?: number | null;
  final_action?: Action | null;
  final_confidence0to1?: number | null;
  final_changed_at?: string | null;
  final_change_reason?: string | null;
  pct_change_5m: number;
  volatility_proxy: number;
  asia_session: boolean;
  variance_pct: number | null;
  xau_usd: number;
  xau_timestamp_ms?: number | null;
  meta?: Record<string, unknown> | null;
  updated_at: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  country: Country;
  latest: LatestSignal | null;
  last_12_signals: Array<{ action: Action; confidence: number; cycle_key: string }>;
  serverAsOf: string;
};

type AiReview = {
  cycle_key: string;
  country: Country;
  algo_action: Action;
  algo_confidence: number;
  ai_action: Action;
  ai_confidence0to1: number;
  ai_reasons: string[];
  risk_regime: RiskRegime;
  decision: Decision;
  requested_count: number;
  created_at: string;
  updated_at: string;
  raw_response?: {
    geopolitical_risk_override?: boolean;
    triggered_events?: Array<{
      title: string;
      severity: string;
      type: string;
      countries: string[];
      publishedAt: string;
    }>;
  };
};

type AiReviewResponse = { ok: boolean; error?: string; cached?: boolean; review?: AiReview };

function actionStyle(action: Action): { badge: string; title: string } {
  if (action === 'BUY') return { badge: 'bg-green-950/40 border-green-800 text-green-200', title: 'BUY' };
  if (action === 'SELL') return { badge: 'bg-red-950/40 border-red-800 text-red-200', title: 'SELL' };
  return { badge: 'bg-gray-900 border-gray-700 text-gray-200', title: 'HOLD' };
}

function formatPct(x: number): string {
  if (!Number.isFinite(x)) return '0.00%';
  const pct = x * 100;
  const s = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
  return s;
}

function fmtLocal(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}

function fmtUtcHm(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(d);
}

export default function GoldSignalCard(props: { country: Country; isPremium?: boolean }) {
  const { lang } = useLang();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(Boolean(props.isPremium));
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<AiReview | null>(null);

  const title = lang === 'ar' ? 'إشارة الذهب (GOLD)' : 'Gold Signal (GOLD)';

  useEffect(() => {
    let cancelled = false;
    const load = async (signal: AbortSignal) => {
      try {
        setError(null);
        const res = await fetch(`/api/signals/gold?country=${encodeURIComponent(props.country)}`, { cache: 'no-store', signal });
        const json = (await res.json().catch(() => null)) as ApiResponse | null;
        if (cancelled || signal.aborted) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
        setData(json);
      } catch (e) {
        if (cancelled || signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Failed to load signal');
      } finally {
        if (!cancelled && !signal.aborted) setLoading(false);
      }
    };
    const stop = startVisiblePolling(load, 30_000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [props.country]);

  useEffect(() => {
    // Lazy premium detection (used to enable AI validation toggle).
    fetch('/api/user/premium-status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setIsPremium(Boolean(j?.status?.isPremium)))
      .catch(() => setIsPremium(false));
  }, []);

  const latest = data?.latest ?? null;
  const finalAction = (latest?.final_action ?? latest?.action ?? 'HOLD') as Action;
  const finalConf = Number(latest?.final_confidence0to1 ?? latest?.confidence ?? 0);
  const style = actionStyle(finalAction);

  const subtitle = useMemo(() => {
    const c = props.country === 'EG' ? (lang === 'ar' ? 'مصر (EG)' : 'Egypt (EG)') : (lang === 'ar' ? 'عالمي' : 'Global');
    return lang === 'ar' ? `الدورة العالمية — ${c}` : `Global cycle — ${c}`;
  }, [lang, props.country]);

  return (
    <div className="bg-gray-900 rounded-lg shadow p-6 overflow-hidden border-l-4 border-gold-600">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-100">{title}</div>
          <div className="text-sm text-gray-400 mt-1">{subtitle}</div>
        </div>
        <div className={`px-3 py-1 rounded-md border text-xs font-semibold ${style.badge}`}>{style.title}</div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-gray-400">{lang === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-300">{error}</div>
      ) : !latest ? (
        <div className="mt-4 text-sm text-gray-400">{lang === 'ar' ? 'لا توجد إشارة بعد.' : 'No signal yet.'}</div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <ConfidenceRing value0to1={finalConf} />

            <div className="text-sm text-gray-300">
              <div>
                <span className="text-gray-400">{lang === 'ar' ? 'تغير ٥ دقائق:' : '5m change:'}</span>{' '}
                <span className={latest.pct_change_5m >= 0 ? 'text-green-300' : 'text-red-300'}>{formatPct(latest.pct_change_5m)}</span>
              </div>
              <div className="mt-1">
                <span className="text-gray-400">{lang === 'ar' ? 'XAU/USD:' : 'XAU/USD:'}</span>{' '}
                <span className="font-mono">{latest.xau_usd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {props.country === 'EG' && latest.variance_pct !== null && (
            <div className="mt-4 text-xs text-gray-400">
              {lang === 'ar' ? 'انحراف السوق المحلي:' : 'Local variance:'}{' '}
              <span className={latest.variance_pct >= 0 ? 'text-red-300' : 'text-green-300'}>{formatPct(latest.variance_pct)}</span>
            </div>
          )}

          {props.country === 'EG' && latest.meta && (latest.meta as any).eg_local_24_latest ? (
            <div className="mt-3 text-xs text-gray-400 space-y-1">
              <div>
                <span className="text-gray-400">{lang === 'ar' ? 'محلي ٢٤K:' : 'Local 24K:'}</span>{' '}
                <span className="font-mono">{Number((latest.meta as any).eg_local_24_latest).toFixed(2)}</span> EGP/g
              </div>
              {typeof (latest.meta as any).eg_local_18_latest === 'number' ? (
                <div>
                  <span className="text-gray-400">{lang === 'ar' ? 'محلي ١٨K:' : 'Local 18K:'}</span>{' '}
                  <span className="font-mono">{Number((latest.meta as any).eg_local_18_latest).toFixed(2)}</span> EGP/g
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 text-xs text-gray-500">
            <span title={lang === 'ar' ? 'إشارة نهائية فعالة حتى تتغير' : 'Final signal is active until changed'}>
              {lang === 'ar' ? 'الحالة النهائية:' : 'Final:'}{' '}
              <span className="font-semibold text-gray-200">{finalAction}</span>
            </span>
            {latest.final_changed_at ? (
              <>
                {' · '}
                <span title={`${lang === 'ar' ? 'محلي/UTC' : 'Local/UTC'}: ${fmtLocal(latest.final_changed_at)} / ${fmtUtcHm(latest.final_changed_at)} UTC`}>
                  {lang === 'ar' ? 'فعالة منذ:' : 'Active since:'} {fmtLocal(latest.final_changed_at)}
                </span>
              </>
            ) : null}
            {' · '}
            <span title={`${lang === 'ar' ? 'محلي/UTC' : 'Local/UTC'}: ${fmtLocal(latest.cycle_started_at)} / ${fmtUtcHm(latest.cycle_started_at)} UTC`}>
              {lang === 'ar' ? 'آخر تقييم:' : 'Last evaluated:'} {fmtLocal(latest.cycle_started_at)}
            </span>
            {' · '}
            <span title={lang === 'ar' ? 'جلسة آسيا: 00:00–08:59 UTC' : 'Asia session: 00:00–08:59 UTC'}>
              {latest.asia_session ? (lang === 'ar' ? 'جلسة آسيا' : 'Asia session') : (lang === 'ar' ? 'خارج جلسة آسيا' : 'Non-Asia')}
            </span>
            {' · '}
            <span title={lang === 'ar' ? 'مفتاح الدورة (UTC)' : 'Cycle key (UTC)'}>
              {lang === 'ar' ? 'الدورة:' : 'Cycle:'} <span className="font-mono">{latest.cycle_key}</span> (UTC)
            </span>
            {typeof latest.xau_timestamp_ms === 'number' ? (
              <>
                {' · '}
                <span title={lang === 'ar' ? 'وقت لقطة السعر (UTC)' : 'Spot tick time (UTC)'}>
                  {lang === 'ar' ? 'لقطة السعر:' : 'Spot tick:'} {fmtLocal(latest.xau_timestamp_ms)} (UTC {fmtUtcHm(latest.xau_timestamp_ms)})
                </span>
              </>
            ) : null}
          </div>

          {latest.final_change_reason || (latest.meta && Array.isArray((latest.meta as any).final_guards)) ? (
            <details className="mt-3 text-xs text-gray-300">
              <summary className="cursor-pointer text-gray-400">
                {lang === 'ar' ? 'لماذا هذه الحالة؟' : 'Why this state?'}
              </summary>
              <div className="mt-2 space-y-1">
                {latest.final_change_reason ? (
                  <div>
                    <span className="text-gray-400">{lang === 'ar' ? 'سبب التغيير:' : 'Change reason:'}</span>{' '}
                    <span className="font-mono">{String(latest.final_change_reason)}</span>
                  </div>
                ) : null}
                {latest.meta && Array.isArray((latest.meta as any).final_guards) ? (
                  <div>
                    <span className="text-gray-400">{lang === 'ar' ? 'حواجز:' : 'Guards:'}</span>{' '}
                    <span className="font-mono">{(latest.meta as any).final_guards.join(', ')}</span>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

          {/* Geopolitical Risk Warning Banner */}
          {aiReview?.raw_response?.geopolitical_risk_override && aiReview.raw_response.triggered_events && aiReview.raw_response.triggered_events.length > 0 ? (
            <div className="mt-4 rounded-lg border-2 border-red-700 bg-red-950/40 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="font-semibold text-red-300 mb-1">
                    {lang === 'ar' ? '⚠️ تم اكتشاف تصعيد جيوسياسي – المخاطر مرتفعة' : '⚠️ Geopolitical escalation detected – risk elevated'}
                  </div>
                  <div className="text-sm text-red-200 mb-2">
                    {lang === 'ar' 
                      ? `تم اكتشاف ${aiReview.raw_response.triggered_events.length} حدث عالي الخطورة. تم تعديل نظام المخاطر بناءً على الأحداث الفعلية، وليس التقلبات السعرية.`
                      : `${aiReview.raw_response.triggered_events.length} high-severity event(s) detected. Risk regime adjusted based on actual events, not price volatility.`}
                  </div>
                  <details className="text-xs text-red-300">
                    <summary className="cursor-pointer font-semibold">
                      {lang === 'ar' ? 'عرض الأحداث المسببة' : 'View triggered events'}
                    </summary>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      {aiReview.raw_response.triggered_events.slice(0, 5).map((event, idx) => (
                        <li key={idx} className="text-red-200">
                          <span className="font-semibold">{event.type}:</span> {event.title}
                          {event.countries.length > 0 && (
                            <span className="text-red-300"> ({event.countries.join(', ')})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-100">
                  {lang === 'ar' ? 'تحقق المخاطر بالذكاء الاصطناعي' : 'AI Risk Validation'}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {lang === 'ar'
                    ? 'اختياري للمميز: يراجع السياق ويقوم بتخفيض الإشارة إلى HOLD عند ارتفاع المخاطر.'
                    : 'Optional for Premium: validates context and may downgrade to HOLD when risk is elevated.'}
                </div>
              </div>
              {!isPremium ? (
                <Link href="/premium" className="px-3 py-2 rounded-md bg-gold-600 text-white text-xs font-semibold hover:bg-gold-700">
                  {lang === 'ar' ? 'ترقية' : 'Upgrade'}
                </Link>
              ) : (
                <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => {
                      setAiEnabled(e.target.checked);
                      setAiError(null);
                      setAiReview(null);
                    }}
                  />
                  {lang === 'ar' ? 'تفعيل' : 'Enable'}
                </label>
              )}
            </div>

            {isPremium && aiEnabled && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={async () => {
                    setAiLoading(true);
                    setAiError(null);
                    try {
                      const res = await fetch('/api/signals/gold/ai-review', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ country: props.country, cycle_key: latest.cycle_key }),
                        cache: 'no-store',
                      });
                      const json = (await res.json().catch(() => null)) as AiReviewResponse | null;
                      if (!res.ok || !json?.ok || !json.review) {
                        throw new Error(json?.error || `AI failed (${res.status})`);
                      }
                      setAiReview(json.review);
                    } catch (e) {
                      setAiError(e instanceof Error ? e.message : 'AI request failed');
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                  className="px-3 py-2 rounded-md bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 text-xs font-semibold disabled:opacity-60"
                >
                  {aiLoading ? (lang === 'ar' ? 'جارٍ التحقق…' : 'Validating…') : (lang === 'ar' ? 'تشغيل التحقق' : 'Run validation')}
                </button>

                {aiError && <div className="mt-2 text-xs text-red-300">{aiError}</div>}

                {aiReview && (
                  <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-gray-300">
                        <span className="text-gray-400">{lang === 'ar' ? 'القرار:' : 'Decision:'}</span>{' '}
                        <span className="font-semibold">
                          {aiReview.decision === 'overridden'
                            ? (lang === 'ar' ? 'تجاوز AI' : 'AI Override')
                            : aiReview.decision === 'downgraded_to_hold'
                              ? (lang === 'ar' ? 'فلتر مخاطر → HOLD' : 'Risk Filter → HOLD')
                              : aiReview.decision === 'fallback_algo'
                                ? (lang === 'ar' ? 'تعذر AI (تم استخدام الخوارزمية)' : 'AI unavailable (algo used)')
                                : (lang === 'ar' ? 'موافق عليه' : 'Approved')}
                        </span>
                      </div>
                      <ConfidenceRing value0to1={aiReview.ai_confidence0to1} label={lang === 'ar' ? 'ثقة AI' : 'AI confidence'} />
                    </div>
                    <div className="text-xs text-gray-400">
                      {lang === 'ar' ? 'إشارة AI:' : 'AI action:'}{' '}
                      <span className="font-semibold text-gray-200">{aiReview.ai_action}</span>
                      {' · '}
                      {lang === 'ar' ? 'نظام المخاطر:' : 'Risk regime:'}{' '}
                      <span className="font-semibold text-gray-200">{aiReview.risk_regime}</span>
                    </div>
                    {aiReview.ai_reasons.length > 0 && (
                      <ul className="list-disc list-inside text-xs text-gray-300">
                        {aiReview.ai_reasons.slice(0, 5).map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

