import type { Metadata } from 'next';
import Link from 'next/link';
import GoldTodayLiveClient from '@/components/landing/GoldTodayLiveClient';
import Header from '@/components/layout/Header';
import Footer from '@/components/Footer';
import { getGoldTodayLandingData } from '@/lib/landing/gold-today';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://egyptgoldpro.com';
const path = '/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8-%D8%A7%D9%84%D9%8A%D9%88%D9%85';
const canonical = `${siteUrl}${path}`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'أسعار الذهب اليوم في مصر لحظة بلحظة | عيار 21 و24 الآن',
  description:
    'تابع أسعار الذهب اليوم في مصر لحظة بلحظة لعيار 21 و24 و18 مع تحليل السوق وتوقعات الأسعار وإشارات الشراء والبيع.',
  alternates: {
    canonical,
    languages: {
      'ar-EG': canonical,
    },
  },
  openGraph: {
    title: 'أسعار الذهب اليوم في مصر لحظة بلحظة | عيار 21 و24 الآن',
    description:
      'تابع أسعار الذهب اليوم في مصر لحظة بلحظة لعيار 21 و24 و18 مع تحليل السوق وتوقعات الأسعار وإشارات الشراء والبيع.',
    url: canonical,
    locale: 'ar_EG',
    type: 'website',
    images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: 'أسعار الذهب اليوم في مصر' }],
  },
};

export default async function GoldTodayArabicLandingPage() {
  const data = await getGoldTodayLandingData();
  const q21 = data.prices[21].current ? Math.round(data.prices[21].current).toString() : '0';
  const q24 = data.prices[24].current ? Math.round(data.prices[24].current).toString() : '0';
  const q18 = data.prices[18].current ? Math.round(data.prices[18].current).toString() : '0';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: 'سعر الذهب اليوم في مصر',
        description: 'أسعار الذهب اليوم في مصر محدثة لحظة بلحظة.',
        offers: [
          { '@type': 'Offer', price: q21, priceCurrency: 'EGP', name: 'سعر عيار 21' },
          { '@type': 'Offer', price: q24, priceCurrency: 'EGP', name: 'سعر عيار 24' },
          { '@type': 'Offer', price: q18, priceCurrency: 'EGP', name: 'سعر عيار 18' },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'كم سعر الذهب اليوم في مصر؟',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `سعر عيار 21 الآن حوالي ${q21} جنيه، وعيار 24 حوالي ${q24} جنيه، وعيار 18 حوالي ${q18} جنيه حسب أحدث تجميع للمصادر.`,
            },
          },
          {
            '@type': 'Question',
            name: 'هل الوقت مناسب لشراء الذهب؟',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `الإشارة الحالية: ${data.signal.actionAr} (${data.signal.strengthStars})، ويُنصح بالمتابعة اللحظية وإدارة المخاطر قبل أي قرار.`,
            },
          },
          {
            '@type': 'Question',
            name: 'لماذا يتغير سعر الذهب يومياً؟',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'يتغير سعر الذهب بسبب حركة السعر العالمي، وسعر الدولار مقابل الجنيه، وتكاليف المصنعية والطلب المحلي.',
            },
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-black flex flex-col" dir="rtl">
      <Header title="أسعار الذهب اليوم" subtitle="تغطية لحظية وتحليل ذكي لسوق الذهب المصري" />
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <GoldTodayLiveClient initialData={data} />

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">📊 تحليل السعر الآن</h2>
          <div className="text-gray-200 leading-8">
            المتوسط المجمع الحالي مبني على <span className="font-semibold text-white">{data.sourcesCount}</span> مصدر.
            مستوى الثقة <span className="font-semibold text-white">{typeof data.confidence === 'number' ? `${Math.round(data.confidence * 100)}%` : 'غير متاح'}</span>.
            الإشارة الحالية: <span className="font-semibold text-white">{data.signal.actionAr}</span> {data.signal.strengthStars} - {data.signal.explanationAr}
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">🤖 تفسير ذكي للسعر</h2>
          <p className="text-gray-200 leading-8">
            السعر الحالي داخل نطاق: <span className="text-white font-semibold">{data.signal.zoneLabelAr}</span>. 
            {` ${data.signal.explanationAr}`} هذا التفسير يعتمد على الإشارة، اتجاه الحركة القصيرة، وعدد المصادر النشطة.
          </p>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">تحليل سعر الذهب اليوم</h2>
          <p className="text-gray-200 leading-8">
            نعرض سعر الذهب اليوم في مصر بتحديثات متقاربة زمنياً اعتماداً على تجميع وسيط الأسعار من مصادر متعددة،
            مع إبراز التغير اللحظي لكل عيار (21 و24 و18) ومؤشر الثقة في القراءة.
          </p>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">لماذا تختلف أسعار الذهب في مصر؟</h2>
          <ul className="text-gray-200 leading-8 list-disc pr-5">
            <li>المصنعية: تختلف بين المحلات والمنتجات.</li>
            <li>الدولار: أي تغير في سعر الصرف ينعكس سريعاً على السعر المحلي.</li>
            <li>السوق العالمي: حركة أونصة الذهب العالمية تؤثر مباشرة على التسعير.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">توقعات أسعار الذهب</h2>
          <p className="text-gray-200 leading-8">
            التوقع اللحظي حالياً: <span className="text-white font-semibold">{data.signal.actionAr}</span> مع قوة {data.signal.strengthStars}.
            يمكنك متابعة تفاصيل أعمق عبر صفحة الإشارات وتحليل الاتجاهات قبل اتخاذ القرار.
          </p>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-3">الأسئلة الشائعة</h2>
          <div className="space-y-4 text-gray-200">
            <div>
              <h3 className="font-semibold text-white">كم سعر الذهب اليوم في مصر؟</h3>
              <p>سعر عيار 21 الآن حوالي {q21} جنيه، وعيار 24 حوالي {q24} جنيه، وعيار 18 حوالي {q18} جنيه.</p>
            </div>
            <div>
              <h3 className="font-semibold text-white">هل الوقت مناسب لشراء الذهب؟</h3>
              <p>الإشارة الحالية {data.signal.actionAr} ({data.signal.strengthStars})، ويُفضل المتابعة المستمرة وتقسيم الشراء أو البيع على مراحل.</p>
            </div>
            <div>
              <h3 className="font-semibold text-white">لماذا يتغير سعر الذهب يومياً؟</h3>
              <p>بسبب تحرك السعر العالمي، وتقلب سعر الدولار، واختلاف الطلب والمصنعية في السوق المحلي.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gold-700 bg-gold-900/10 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gold-400 mb-2">📲 تابع أسعار الذهب لحظة بلحظة عبر الإشعارات</h2>
          <p className="text-gray-200 mb-3">فعّل تنبيهات الأسعار والإشارات لتصلك التحديثات فوراً.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/account/notifications" className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white">
              إعداد الإشعارات
            </Link>
            <Link href="/account/notifications" className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white">
              ربط تيليجرام
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-gold-400 mb-3">روابط مهمة</h2>
          <div className="flex flex-wrap gap-3 text-blue-300">
            <Link href="/signals" className="underline">أسعار الذهب اليوم - الإشارات</Link>
            <Link href="/portfolio" className="underline">أسعار الذهب اليوم - المحفظة</Link>
            <Link href="/gold" className="underline">أسعار الذهب اليوم - صفحة الذهب</Link>
          </div>
        </section>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Footer />
    </div>
  );
}
