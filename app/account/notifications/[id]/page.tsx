'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import Header from '@/components/layout/Header';
import Footer from '@/components/Footer';
import { useLang } from '@/components/LanguageProvider';
import ShareSignalButton, { SignalTrustBadges } from '@/components/ShareSignalButton';

type Direction = 'UP' | 'DOWN' | 'STALE';

function parseDirection(title: string, body: string): Direction {
  const t = `${title} ${body}`.toUpperCase();
  if (t.includes('UP') || t.includes('↑')) return 'UP';
  if (t.includes('DOWN') || t.includes('↓')) return 'DOWN';
  return 'STALE';
}

function parsePriceAndCurrency(text: string): { price: number | null; currency: string | null } {
  // Best-effort: "8400 EGP" or "8,400 EGP" or "8400.50 USD"
  const m = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(EGP|USD|AED|SAR)\b/i);
  if (!m) return { price: null, currency: null };
  const raw = m[1].replace(/,/g, '');
  const n = Number(raw);
  if (!isFinite(n)) return { price: null, currency: null };
  return { price: n, currency: String(m[2]).toUpperCase() };
}

export default function NotificationDetailsPage() {
  const { lang } = useLang();
  const params = useParams<{ id: string }>();
  const id = params?.id ? String(params.id) : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notif, setNotif] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/notifications/inapp/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to load notification');
        if (cancelled) return;
        setNotif(json.notification ?? null);
        // Mark read (best-effort)
        void fetch(`/api/notifications/inapp/${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => undefined);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (id) void run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const derived = useMemo(() => {
    const title = String(notif?.title ?? '');
    const body = String(notif?.body ?? '');
    const direction = parseDirection(title, body);
    const { price, currency } = parsePriceAndCurrency(`${title} ${body}`);
    const country = notif?.country ? String(notif.country) : undefined;
    const createdAt = notif?.created_at ? String(notif.created_at) : null;
    return { title, body, direction, price, currency, country, createdAt };
  }, [notif]);

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className={`mb-4 ${lang === 'ar' ? 'text-right' : ''}`}>
          <Link href="/account/notifications" className="text-sm text-gray-300 hover:text-white">
            {lang === 'ar' ? '← رجوع' : '← Back'}
          </Link>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          {loading ? (
            <div className="text-gray-300">{lang === 'ar' ? 'جار التحميل…' : 'Loading…'}</div>
          ) : error ? (
            <div className="text-red-200">{error}</div>
          ) : !notif ? (
            <div className="text-gray-300">{lang === 'ar' ? 'غير موجود' : 'Not found'}</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500">{derived.createdAt ? new Date(derived.createdAt).toLocaleString() : '—'}</div>
                <div className="mt-1 text-lg font-semibold text-gray-100">{derived.title}</div>
                <div className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">{derived.body}</div>
              </div>

              <div className={`flex flex-wrap items-center gap-3 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    derived.direction === 'UP'
                      ? 'border-emerald-700 bg-emerald-900/20 text-emerald-200'
                      : derived.direction === 'DOWN'
                        ? 'border-red-700 bg-red-900/20 text-red-200'
                        : 'border-gray-700 bg-gray-900/40 text-gray-200'
                  }`}
                >
                  {derived.direction}
                </span>

                <SignalTrustBadges lastUpdatedAt={derived.createdAt} validatedAfterMinutes={null} />

                <ShareSignalButton
                  direction={derived.direction}
                  country={derived.country}
                  scope={undefined}
                  price={derived.price}
                  currency={derived.currency}
                  lastUpdatedAt={derived.createdAt}
                  validatedAfterMinutes={null}
                />
              </div>

              {derived.country && (
                <div className={`text-xs text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
                  {lang === 'ar' ? 'الدولة' : 'Country'}: {derived.country}
                </div>
              )}

              {notif?.url && (
                <div className={`text-sm ${lang === 'ar' ? 'text-right' : ''}`}>
                  <a className="text-blue-300 hover:text-blue-200" href={String(notif.url)}>
                    {lang === 'ar' ? 'فتح الرابط' : 'Open link'}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

