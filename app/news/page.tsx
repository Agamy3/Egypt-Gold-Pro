'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { useLang } from '@/components/LanguageProvider';
import AdGateClient from '@/components/ads/AdGateClient';
import Header from '@/components/layout/Header';
import { htmlToText } from '@/lib/html-text-converter';

interface PublicNewsItem {
  id: number;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  image_url: string | null;
  country: string | null;
}

interface PremiumNewsItem extends PublicNewsItem {
  summary: string | null;
  tags: string[];
  whyItMatters: string[];
  contextTags: string[];
}

function NewsPageContent() {
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const urlCountry = searchParams.get('country') as 'EG' | 'AE' | 'SA' | 'US' | 'GLOBAL' | null;
  const [country, setCountry] = useState<'EG' | 'AE' | 'SA' | 'US' | 'GLOBAL'>(
    (urlCountry && ['EG', 'AE', 'SA', 'US', 'GLOBAL'].includes(urlCountry)) ? urlCountry : 'EG'
  );
  
  // Also check if we came from /us page (no country param but should be US)
  useEffect(() => {
    if (!urlCountry && typeof window !== 'undefined') {
      // Check if referrer was /us
      const referrer = document.referrer;
      if (referrer.includes('/us')) {
        setCountry('US');
        // Update URL to include country param
        const url = new URL(window.location.href);
        url.searchParams.set('country', 'US');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [urlCountry]);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publicItems, setPublicItems] = useState<PublicNewsItem[]>([]);
  const [premiumItemsByUrl, setPremiumItemsByUrl] = useState<Record<string, PremiumNewsItem>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastIngestedAt, setLastIngestedAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Sync country with URL params
  useEffect(() => {
    const urlCountry = searchParams.get('country') as 'EG' | 'AE' | 'SA' | 'US' | 'GLOBAL' | null;
    if (urlCountry && ['EG', 'AE', 'SA', 'US', 'GLOBAL'].includes(urlCountry)) {
      setCountry(urlCountry);
    }
  }, [searchParams]);

  useEffect(() => {
    // Detect premium status via existing endpoint that uses getUserStatus server-side
    fetch('/api/user/premium-status')
      .then((res) => res.json())
      .then((data) => {
        setIsPremium(Boolean(data.status?.isPremium));
      })
      .catch(() => setIsPremium(false));
  }, []);

  useEffect(() => {
    // Check admin status for ingest CTA
    fetch('/api/user/is-admin')
      .then((res) => res.json())
      .then((data) => {
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);

        const publicRes = await fetch(`/api/news?country=${country}&limit=20`);
        const publicData = await publicRes.json();
        if (!publicRes.ok || !publicData.ok) {
          throw new Error(publicData.error || 'Failed to load news');
        }

        setPublicItems(publicData.items || []);
        setLastIngestedAt(publicData.last_ingested_at || null);

        if (isPremium) {
          const premiumRes = await fetch(`/api/news/premium?country=${country}&limit=20`);
          const premiumData = await premiumRes.json();

          if (premiumRes.ok && premiumData.ok) {
            const byUrl: Record<string, PremiumNewsItem> = {};
            (premiumData.items || []).forEach((item: PremiumNewsItem) => {
              if (item.url) {
                byUrl[item.url] = item;
              }
            });
            setPremiumItemsByUrl(byUrl);
          } else if (premiumRes.status === 403) {
            setPremiumItemsByUrl({});
          }
        } else {
          setPremiumItemsByUrl({});
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load news');
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, [country, isPremium]);

  const formatTimeAgo = (iso: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
      return lang === 'ar' ? `منذ ${diffMins} دقيقة` : `${diffMins} min ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return lang === 'ar' ? `منذ ${diffHours} ساعة` : `${diffHours} h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return lang === 'ar' ? `منذ ${diffDays} يوم` : `${diffDays} d ago`;
  };

  const pageTitle = lang === 'ar' ? 'أخبار الذهب' : 'Gold News';

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header 
        title={pageTitle}
        subtitle={!isPremium ? (lang === 'ar' ? 'محتوى مميز متاح' : 'Premium context available') : undefined}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 flex-1 w-full">
        {error && (
          <div className="mb-4 bg-red-900/60 border border-red-700 text-red-100 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {loading && !publicItems.length ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">{lang === 'ar' ? 'جاري تحميل الأخبار...' : 'Loading news...'}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {publicItems.map((item, index) => {
              const premium = item.url ? premiumItemsByUrl[item.url] : undefined;
              const showNewsAd = index === 2 && publicItems.length >= 4;

              return (
                <div key={item.id} className="space-y-4">
                  <article
                    className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-5 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row gap-4">
                      {item.image_url && (
                        <div className="w-full sm:w-32 h-24 bg-gray-800 rounded overflow-hidden flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base sm:text-lg font-semibold text-gray-100 hover:text-gold-400 line-clamp-2"
                          >
                            {htmlToText(item.title)}
                          </a>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-3">
                          {item.source && <span>{item.source}</span>}
                          {item.published_at && (
                            <span className="text-gray-500">{formatTimeAgo(item.published_at)}</span>
                          )}
                          {item.country && (
                            <span className="px-2 py-0.5 rounded border border-gray-700 text-gray-300">
                              {item.country}
                            </span>
                          )}
                        </div>

                        {premium ? (
                          <div className="mt-2 space-y-2">
                            {premium.summary && (
                              <p className="text-sm text-gray-300 line-clamp-3">{htmlToText(premium.summary)}</p>
                            )}
                            {premium.whyItMatters.length > 0 && (
                              <div className="mt-2">
                                <h3 className="text-xs font-semibold text-gray-400 mb-1">
                                  {lang === 'ar' ? 'لماذا يهم هذا:' : 'Why this matters:'}
                                </h3>
                                <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                                  {premium.whyItMatters.map((b, idx) => (
                                    <li key={idx}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {(premium.tags.length > 0 || premium.contextTags.length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {[...premium.tags, ...premium.contextTags].map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-full bg-gray-800 text-[10px] text-gray-300 border border-gray-700"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 bg-gray-800/60 border border-dashed border-gray-700 rounded-md p-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-sm">🔒</span>
                              <p className="text-xs text-gray-300">
                                {lang === 'ar'
                                  ? 'افتح السياق والعوامل الرئيسية وراء العنوان مع العضوية المميزة.'
                                  : 'Unlock context & key drivers behind the headline with Premium.'}
                              </p>
                            </div>
                            <Link
                              href="/premium"
                              className="px-3 py-1.5 bg-gold-600 hover:bg-gold-700 text-white text-xs rounded-md font-semibold whitespace-nowrap"
                            >
                              {lang === 'ar' ? 'ترقية' : 'Upgrade'}
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>

                  {showNewsAd && (
                    <div className="mt-4">
                      <AdGateClient
                        adSlot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD || '9450111383'}
                        format="auto"
                        className="w-full"
                        contentItemCount={publicItems.length}
                        minItems={4}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {publicItems.length === 0 && !loading && !error && (
              <div className="max-w-3xl mx-auto mt-8">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 sm:p-6 lg:p-8 space-y-4">
                  <h2 className="text-xl sm:text-2xl font-semibold text-gold-400">
                    {lang === 'ar' ? 'لا توجد أخبار منشورة بعد لهذه الدولة' : 'No news published yet for this country'}
                  </h2>
                  <p className="text-sm text-gray-300">
                    {lang === 'ar'
                      ? 'نبني موجزاً لأخبار الذهب والاقتصاد من مصادر عالمية ومحلية موثوقة. ستجد هنا عناوين تساعدك على فهم ما يحرك أسعار الذهب، التضخم، أسعار الفائدة، وسعر الصرف.'
                      : 'We are building a curated stream of gold and macro news from trusted global and local sources. This page will highlight headlines that explain what is moving gold, inflation, interest rates, and FX.'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-300">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-gray-100">
                        {lang === 'ar' ? 'أمثلة على المصادر' : 'Example sources'}
                      </h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Kitco Gold News</li>
                        <li>Reuters Markets &amp; Economy</li>
                        <li>Investing.com Gold</li>
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-gray-100">
                        {lang === 'ar' ? 'ماذا ستجد هنا؟' : 'What you will see here'}
                      </h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          {lang === 'ar'
                            ? 'عناوين مترابطة مع تحركات سوق الذهب المحلي والعالمي.'
                            : 'Headlines connected to local and global gold price moves.'}
                        </li>
                        <li>
                          {lang === 'ar'
                            ? 'قصص عن التضخم، أسعار الفائدة، وسعر الصرف التي تؤثر على مدخراتك بالذهب.'
                            : 'Stories on inflation, interest rates, and FX that impact your gold savings.'}
                        </li>
                        <li>
                          {lang === 'ar'
                            ? 'سياق مميز للمشتركين يشرح لماذا يهم كل خبر.'
                            : 'Premium context that explains why each headline matters.'}
                        </li>
                      </ul>
                    </div>
                  </div>
                  {lastIngestedAt && (
                    <p className="text-xs text-gray-500">
                      {lang === 'ar'
                        ? `آخر عملية استيراد للأخبار من قاعدة البيانات: ${new Date(lastIngestedAt).toLocaleString()}`
                        : `Last news ingestion recorded in the database: ${new Date(lastIngestedAt).toLocaleString()}`}
                    </p>
                  )}
                  <div className="pt-2 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const button = document.activeElement as HTMLButtonElement;
                            const originalText = button.textContent;
                            button.disabled = true;
                            button.textContent = lang === 'ar' ? 'جاري الاستيراد...' : 'Ingesting...';
                            
                            const res = await fetch('/api/admin/news/ingest', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ country }),
                            });
                            const data = await res.json();
                            
                            if (res.ok && data.ok) {
                              const inserted = data.summary?.totalInserted || 0;
                              button.textContent = lang === 'ar' 
                                ? `تم الاستيراد (${inserted} عنصر)`
                                : `Ingested (${inserted} items)`;
                              button.className = 'px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold';
                              
                              // Reload after 1.5s to show new items
                              setTimeout(() => {
                                window.location.reload();
                              }, 1500);
                            } else {
                              button.textContent = lang === 'ar' ? 'فشل الاستيراد' : 'Ingest failed';
                              button.className = 'px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold';
                              setTimeout(() => {
                                button.disabled = false;
                                button.textContent = originalText;
                                button.className = 'px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md text-sm font-semibold';
                              }, 3000);
                            }
                          } catch (err) {
                            const button = document.activeElement as HTMLButtonElement;
                            button.disabled = false;
                            button.textContent = lang === 'ar' ? 'خطأ في الاستيراد' : 'Ingest error';
                            button.className = 'px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold';
                            setTimeout(() => {
                              button.textContent = lang === 'ar' ? 'استيراد أحدث الأخبار الآن' : 'Ingest latest news now';
                              button.className = 'px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md text-sm font-semibold';
                            }, 3000);
                          }
                        }}
                        className="px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md text-sm font-semibold"
                      >
                        {lang === 'ar' ? 'استيراد أحدث الأخبار الآن' : 'Ingest latest news now'}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">
                        {lang === 'ar'
                          ? 'يتم تحضير موجز أخبار الذهب حالياً. يرجى العودة قريباً.'
                          : 'We are preparing the gold news feed for this country. Please check back soon.'}
                      </span>
                    )}
                    {!isAdmin && lastIngestedAt && (
                      <span className="text-xs text-gray-500">
                        {lang === 'ar'
                          ? `آخر تحديث للأخبار: ${new Date(lastIngestedAt).toLocaleString()}`
                          : `Last news refresh: ${new Date(lastIngestedAt).toLocaleString()}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <NewsPageContent />
    </Suspense>
  );
}
