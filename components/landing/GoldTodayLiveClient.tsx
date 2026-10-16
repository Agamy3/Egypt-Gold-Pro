'use client';

import { startVisiblePolling } from '@/lib/client/visible-polling.mjs';

import { useEffect, useMemo, useState } from 'react';
import type { GoldTodayData } from '@/lib/landing/gold-today';

type Props = {
  initialData: GoldTodayData;
};

function fmtPrice(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return `${Math.round(v).toLocaleString('en-US')} جنيه`;
}

function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export default function GoldTodayLiveClient({ initialData }: Props) {
  const [data, setData] = useState<GoldTodayData>(initialData);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const everySecond = setInterval(() => setNowMs(Date.now()), 1000);
    const stop = startVisiblePolling(async (signal) => {
      try {
        const res = await fetch('/api/landing/gold-today', { cache: 'no-store', signal });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: GoldTodayData } | null;
        if (!signal.aborted && res.ok && json?.ok && json.data) setData(json.data);
      } catch {
        // Keep previous data on transient failures.
      }
    }, 90000, { immediate: false });
    return () => {
      clearInterval(everySecond);
      stop();
    };
  }, []);

  const freshness = useMemo(() => {
    const asOf = Date.parse(data.asOf);
    if (!isFinite(asOf)) return data.freshnessMinutes;
    return Math.max(0, Math.floor((nowMs - asOf) / 60000));
  }, [data.asOf, data.freshnessMinutes, nowMs]);

  const confidencePct = typeof data.confidence === 'number' ? `${Math.round(data.confidence * 100)}%` : '—';

  const priceCards = ([21, 24, 18] as const).map((k) => data.prices[k]);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6" dir="rtl">
      <h1 className="text-2xl sm:text-3xl font-bold text-gold-400 mb-3">أسعار الذهب اليوم في مصر (تحديث لحظي)</h1>
      {data.marketTrust && !data.marketTrust.homepageSafeToUse ? (
        <div className="mb-4 rounded-lg border border-amber-700/80 bg-amber-950/35 px-3 py-2 text-sm text-amber-100/95 leading-6">
          تنبيه: أسعار السوق المحلي أدناه قد لا تعكس بيانات لحظية موثوقة (عدد غير كافٍ من المصادر المحدثة، أو تجميع غير
          مدعوم بقراءات حديثة من نفس دورة الجمع). يُنصح بالتحقق قبل أي قرار.
        </div>
      ) : null}
      <div className="text-sm text-gray-300 mb-4">
        آخر تحديث منذ <span className="font-semibold text-white">{freshness}</span> دقيقة
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {(['21', '24', '18'] as const).map((karat, idx) => {
          const p = priceCards[idx];
          const up = p.direction === 'up';
          const down = p.direction === 'down';
          return (
            <div key={karat} className="rounded-lg border border-gray-700 bg-black/30 p-4">
              <div className="text-sm text-gray-300 mb-2">عيار {karat}</div>
              <div className="text-3xl font-bold text-white">{fmtPrice(p.current)}</div>
              <div className={`mt-2 text-sm font-semibold ${up ? 'text-green-400' : down ? 'text-red-400' : 'text-gray-400'}`}>
                {up ? '↑' : down ? '↓' : '•'} {fmtPct(p.changePct)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <div className="rounded bg-black/30 border border-gray-800 px-3 py-2 text-gray-200">عدد المصادر: {data.sourcesCount}</div>
        <div className="rounded bg-black/30 border border-gray-800 px-3 py-2 text-gray-200">الثقة: {confidencePct}</div>
        <div className="rounded bg-black/30 border border-gray-800 px-3 py-2 text-gray-200">الإشارة: {data.signal.actionAr}</div>
      </div>
    </section>
  );
}
