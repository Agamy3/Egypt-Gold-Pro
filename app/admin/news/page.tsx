/**
 * Admin News Management Page
 * 
 * Admin-only page for fetching and managing news items
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';
import Header from '@/components/layout/Header';

interface IngestResult {
  ok: boolean;
  results?: Record<string, {
    gdelt?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number };
    rss?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number };
    total?: { inserted: number; updated: number; skipped: number; errors: string[] };
    error?: string;
  }>;
  summary?: {
    totalInserted: number;
    totalErrors: number;
    countriesProcessed: number;
  };
  timestamp?: string;
  error?: string;
}

export default function AdminNewsPage() {
  const router = useRouter();
  const { lang } = useLang();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<'EG' | 'AE' | 'SA' | 'US' | 'GLOBAL' | 'ALL'>('ALL');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const res = await fetch('/api/user/is-admin');
      if (res.status === 403 || !res.ok) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setIsAdmin(data.isAdmin === true);
      setLoading(false);
    } catch (error) {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const handleIngest = async () => {
    try {
      setIngesting(true);
      setIngestResult(null);
      setMessage(null);

      const country = selectedCountry === 'ALL' ? undefined : selectedCountry;
      const res = await fetch('/api/admin/news/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(country ? { country } : {}),
      });

      const data = await res.json() as IngestResult;

      if (res.ok && data.ok) {
        setIngestResult(data);
        const totalInserted = data.summary?.totalInserted || 0;
        const totalUpdated = Object.values(data.results || {}).reduce((sum, r) => sum + (r.total?.updated || 0), 0);
        const totalFetched = Object.values(data.results || {}).reduce((sum, r) => sum + (r.gdelt?.fetchedCount || 0) + (r.rss?.fetchedCount || 0), 0);
        
        if (totalInserted > 0 || totalUpdated > 0) {
          setMessage({
            type: 'success',
            text: lang === 'ar'
              ? `تم معالجة ${totalInserted} عنصر جديد و ${totalUpdated} عنصر محدث من ${totalFetched} عنصر مُجلب`
              : `Processed ${totalInserted} new items and ${totalUpdated} updated items from ${totalFetched} fetched`,
          });
        } else if (totalFetched > 0) {
          setMessage({
            type: 'success',
            text: lang === 'ar'
              ? `تم جلب ${totalFetched} عنصر (جميعها موجودة مسبقاً)`
              : `Fetched ${totalFetched} items (all already exist)`,
          });
        } else {
          setMessage({
            type: 'error',
            text: lang === 'ar'
              ? 'لم يتم جلب أي عناصر - تحقق من إعدادات RSS أو GDELT'
              : 'No items fetched - check RSS or GDELT configuration',
          });
        }
      } else {
        setMessage({
          type: 'error',
          text: data.error || (lang === 'ar' ? 'فشل استيراد الأخبار' : 'Failed to ingest news'),
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || (lang === 'ar' ? 'حدث خطأ أثناء الاستيراد' : 'Error during ingestion'),
      });
    } finally {
      setIngesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <Header title={lang === 'ar' ? 'إدارة الأخبار' : 'News Management'} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">{lang === 'ar' ? 'غير مصرح' : 'Not Authorized'}</h1>
            <p className="text-gray-400 mb-8">{lang === 'ar' ? 'ليس لديك صلاحية للوصول إلى هذه الصفحة.' : "You don't have permission to access this page."}</p>
            <Link href="/" className="text-gold-400 hover:text-gold-300">
              {lang === 'ar' ? 'العودة إلى الصفحة الرئيسية' : 'Return to Home'}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const pageTitle = lang === 'ar' ? 'إدارة الأخبار' : 'News Management';
  const pageSubtitle = lang === 'ar' ? 'جلب وإدارة عناصر الأخبار' : 'Fetch and manage news items';

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header title={pageTitle} subtitle={pageSubtitle} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-700 text-green-300'
              : 'bg-red-900/50 border border-red-700 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-gray-900 rounded-lg shadow-md p-6 mb-8 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">
            {lang === 'ar' ? 'جلب الأخبار' : 'Fetch News'}
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {lang === 'ar' ? 'البلد' : 'Country'}
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value as typeof selectedCountry)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
              >
                <option value="ALL">{lang === 'ar' ? 'جميع البلدان' : 'All Countries'}</option>
                <option value="EG">{lang === 'ar' ? 'مصر' : 'Egypt (EG)'}</option>
                <option value="AE">{lang === 'ar' ? 'الإمارات' : 'UAE (AE)'}</option>
                <option value="SA">{lang === 'ar' ? 'السعودية' : 'Saudi Arabia (SA)'}</option>
                <option value="US">{lang === 'ar' ? 'الولايات المتحدة' : 'United States (US)'}</option>
                <option value="GLOBAL">{lang === 'ar' ? 'عالمي' : 'Global'}</option>
              </select>
            </div>

            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="w-full px-4 py-2 bg-gold-600 hover:bg-gold-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-md font-semibold"
            >
              {ingesting
                ? (lang === 'ar' ? 'جاري الجلب...' : 'Fetching...')
                : (lang === 'ar' ? 'جلب الأخبار' : 'Fetch News')}
            </button>
          </div>
        </div>

        {ingestResult && ingestResult.results && (
          <div className="bg-gray-900 rounded-lg shadow-md p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">
              {lang === 'ar' ? 'نتائج الاستيراد' : 'Ingestion Results'}
            </h2>
            
            {ingestResult.summary && (
              <div className="mb-6 p-4 bg-gray-800 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">{lang === 'ar' ? 'إجمالي المُدرج:' : 'Total Inserted:'}</span>
                    <span className="ml-2 text-white font-semibold">{ingestResult.summary.totalInserted}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{lang === 'ar' ? 'إجمالي الأخطاء:' : 'Total Errors:'}</span>
                    <span className="ml-2 text-white font-semibold">{ingestResult.summary.totalErrors}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{lang === 'ar' ? 'البلدان المعالجة:' : 'Countries Processed:'}</span>
                    <span className="ml-2 text-white font-semibold">{ingestResult.summary.countriesProcessed}</span>
                  </div>
                </div>
                {ingestResult.timestamp && (
                  <div className="mt-2 text-xs text-gray-500">
                    {lang === 'ar' ? 'الوقت:' : 'Time:'} {new Date(ingestResult.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(ingestResult.results).map(([country, result]) => (
                <div key={country} className="p-4 bg-gray-800 rounded-md">
                  <h3 className="font-semibold text-white mb-2">{country}</h3>
                  {result.error ? (
                    <div className="text-red-400 text-sm">{result.error}</div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {result.total && (
                        <div className="text-gray-300">
                          {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {result.total.inserted} {lang === 'ar' ? 'مُدرج' : 'inserted'}, {result.total.updated} {lang === 'ar' ? 'محدث' : 'updated'}
                        </div>
                      )}
                      {result.gdelt && (
                        <div className="text-gray-400">
                          GDELT: {result.gdelt.fetchedCount} {lang === 'ar' ? 'مُجلب' : 'fetched'} → {result.gdelt.inserted} {lang === 'ar' ? 'مُدرج' : 'inserted'}
                        </div>
                      )}
                      {result.rss && (
                        <div className="text-gray-400">
                          RSS: {result.rss.fetchedCount} {lang === 'ar' ? 'مُجلب' : 'fetched'} → {result.rss.inserted} {lang === 'ar' ? 'مُدرج' : 'inserted'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/admin"
            className="text-gold-400 hover:text-gold-300"
          >
            {lang === 'ar' ? '← العودة إلى لوحة التحكم' : '← Back to Admin Panel'}
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
