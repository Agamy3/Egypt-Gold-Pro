'use client';

import { useLang } from './LanguageProvider';
import Footer from './Footer';
import Link from 'next/link';
import Image from 'next/image';

const privacyPolicyEn = {
  title: 'Privacy Policy',
  lastUpdated: 'Last Updated: January 2025',
  sections: {
    whoWeAre: {
      title: 'Who We Are',
      content: 'EgyptGold Pro is an educational platform providing gold market analysis and portfolio tracking. For questions about this privacy policy, contact us at: privacy@egyptgoldpro.com',
    },
    dataCollection: {
      title: 'What Data We Collect',
      items: [
        'Account Information: Email address, display name (optional)',
        'User Preferences: Default country, currency, and language settings',
        'Portfolio Data: Gold holdings including karat, purchase price per gram, purchase currency, purchase date, and notes',
        'Notification Rules: Price thresholds, country, karat, direction (above/below), and notification channel preferences',
        'Technical Data: IP address, user agent, and server logs for security and debugging purposes',
        'Cookie Preferences: Your cookie consent choices (stored in cookies and localStorage)',
      ],
    },
    whyWeCollect: {
      title: 'Why We Collect This Data',
      content: 'We collect this data to provide you with:',
      items: [
        'Real-time gold market pricing and analysis',
        'Portfolio tracking and profit/loss calculations',
        'Price alert notifications via email and push notifications',
        'Personalized experience based on your country and currency preferences',
        'Account security and fraud prevention',
      ],
    },
    legalBasis: {
      title: 'Legal Basis',
      content: 'We process your data based on:',
      items: [
        'Consent: When you create an account and configure notification preferences',
        'Legitimate Interest: For security, fraud prevention, and service improvement',
        'Contract Performance: To provide the services you request',
      ],
    },
    dataSharing: {
      title: 'Data Sharing',
      content: 'We share your data only with:',
      items: [
        'Supabase: Our database and authentication provider (hosted in secure data centers)',
        'Resend: Email delivery service for sending notification emails (only your email address)',
        'Web Push Services: For delivering push notifications (subscription endpoints only)',
        'Analytics Providers: Only if you have consented to cookies (currently using Vercel Analytics)',
      ],
      note: 'We do not sell your data to third parties.',
    },
    dataRetention: {
      title: 'Data Retention',
      content: 'We retain your data:',
      items: [
        'Account Data: Until you delete your account',
        'Portfolio Holdings: Until you delete them or your account',
        'Notification Rules: Until you delete them or your account',
        'Server Logs: For up to 90 days for security and debugging purposes',
        'Cookie Preferences: Until you change them or clear your browser data',
      ],
    },
    userRights: {
      title: 'Your Rights',
      content: 'You have the right to:',
      items: [
        'Access: View all data we have about you through your account profile',
        'Update: Modify your profile, preferences, and portfolio data at any time',
        'Delete: Delete your account and all associated data (via Account Settings)',
        'Withdraw Consent: Disable notifications or change cookie preferences at any time',
        'Data Portability: Export your portfolio data (available through the portfolio page)',
      ],
    },
    security: {
      title: 'Security',
      content: 'We implement reasonable security measures including:',
      items: [
        'Encrypted connections (HTTPS) for all data transmission',
        'Row-level security (RLS) policies in our database to ensure users can only access their own data',
        'Secure authentication using industry-standard protocols',
        'Regular security updates and monitoring',
      ],
      note: 'While we strive to protect your data, no method of transmission over the internet is 100% secure.',
    },
    internationalTransfers: {
      title: 'International Data Transfers',
      content: 'Your data may be processed and stored in data centers located outside your country of residence. We use Supabase, which may store data in various regions. By using our service, you consent to such transfers.',
    },
    policyUpdates: {
      title: 'Updates to This Policy',
      content: 'We may update this privacy policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the "Last Updated" date. We encourage you to review this policy periodically.',
    },
    contact: {
      title: 'Contact Us',
      content: 'If you have questions about this privacy policy or wish to exercise your rights, please contact us at: privacy@egyptgoldpro.com',
    },
  },
};

const privacyPolicyAr = {
  title: 'سياسة الخصوصية',
  lastUpdated: 'آخر تحديث: يناير 2025',
  sections: {
    whoWeAre: {
      title: 'من نحن',
      content: 'EgyptGold Pro هي منصة تعليمية توفر تحليلات سوق الذهب وتتبع المحفظة. للأسئلة حول سياسة الخصوصية هذه، اتصل بنا على: privacy@egyptgoldpro.com',
    },
    dataCollection: {
      title: 'البيانات التي نجمعها',
      items: [
        'معلومات الحساب: عنوان البريد الإلكتروني، اسم العرض (اختياري)',
        'تفضيلات المستخدم: البلد الافتراضي، العملة، وإعدادات اللغة',
        'بيانات المحفظة: استثمارات الذهب بما في ذلك العيار، سعر الشراء لكل جرام، عملة الشراء، تاريخ الشراء، والملاحظات',
        'قواعد الإشعارات: عتبات الأسعار، البلد، العيار، الاتجاه (فوق/تحت)، وتفضيلات قناة الإشعارات',
        'البيانات التقنية: عنوان IP، وكيل المستخدم، وسجلات الخادم لأغراض الأمان والتصحيح',
        'تفضيلات ملفات تعريف الارتباط: خيارات موافقتك على ملفات تعريف الارتباط (مخزنة في ملفات تعريف الارتباط و localStorage)',
      ],
    },
    whyWeCollect: {
      title: 'لماذا نجمع هذه البيانات',
      content: 'نجمع هذه البيانات لتوفير:',
      items: [
        'أسعار وتحليلات سوق الذهب في الوقت الفعلي',
        'تتبع المحفظة وحسابات الربح/الخسارة',
        'إشعارات تنبيه الأسعار عبر البريد الإلكتروني والإشعارات الفورية',
        'تجربة مخصصة بناءً على تفضيلات البلد والعملة',
        'أمان الحساب ومنع الاحتيال',
      ],
    },
    legalBasis: {
      title: 'الأساس القانوني',
      content: 'نعالج بياناتك بناءً على:',
      items: [
        'الموافقة: عند إنشاء حساب وتكوين تفضيلات الإشعارات',
        'المصلحة المشروعة: للأمان، منع الاحتيال، وتحسين الخدمة',
        'أداء العقد: لتقديم الخدمات التي تطلبها',
      ],
    },
    dataSharing: {
      title: 'مشاركة البيانات',
      content: 'نشارك بياناتك فقط مع:',
      items: [
        'Supabase: مزود قاعدة البيانات والمصادقة لدينا (مستضافة في مراكز بيانات آمنة)',
        'Resend: خدمة تسليم البريد الإلكتروني لإرسال رسائل الإشعارات (عنوان بريدك الإلكتروني فقط)',
        'خدمات الإشعارات الفورية: لتسليم الإشعارات الفورية (نقاط نهاية الاشتراك فقط)',
        'مزودو التحليلات: فقط إذا وافقت على ملفات تعريف الارتباط (حاليًا باستخدام Vercel Analytics)',
      ],
      note: 'لا نبيع بياناتك لأطراف ثالثة.',
    },
    dataRetention: {
      title: 'الاحتفاظ بالبيانات',
      content: 'نحتفظ ببياناتك:',
      items: [
        'بيانات الحساب: حتى تحذف حسابك',
        'استثمارات المحفظة: حتى تحذفها أو حسابك',
        'قواعد الإشعارات: حتى تحذفها أو حسابك',
        'سجلات الخادم: لمدة تصل إلى 90 يومًا لأغراض الأمان والتصحيح',
        'تفضيلات ملفات تعريف الارتباط: حتى تغيرها أو تمسح بيانات المتصفح',
      ],
    },
    userRights: {
      title: 'حقوقك',
      content: 'لديك الحق في:',
      items: [
        'الوصول: عرض جميع البيانات التي لدينا عنك من خلال ملفك الشخصي',
        'التحديث: تعديل ملفك الشخصي، التفضيلات، وبيانات المحفظة في أي وقت',
        'الحذف: حذف حسابك وجميع البيانات المرتبطة (عبر إعدادات الحساب)',
        'سحب الموافقة: تعطيل الإشعارات أو تغيير تفضيلات ملفات تعريف الارتباط في أي وقت',
        'قابلية نقل البيانات: تصدير بيانات محفظتك (متاحة من خلال صفحة المحفظة)',
      ],
    },
    security: {
      title: 'الأمان',
      content: 'نطبق تدابير أمنية معقولة بما في ذلك:',
      items: [
        'اتصالات مشفرة (HTTPS) لجميع نقل البيانات',
        'سياسات أمان على مستوى الصف (RLS) في قاعدة البيانات لضمان وصول المستخدمين فقط إلى بياناتهم',
        'مصادقة آمنة باستخدام بروتوكولات معيارية',
        'تحديثات ومراقبة أمنية منتظمة',
      ],
      note: 'بينما نسعى لحماية بياناتك، لا توجد طريقة نقل عبر الإنترنت آمنة بنسبة 100%.',
    },
    internationalTransfers: {
      title: 'التحويلات الدولية للبيانات',
      content: 'قد تتم معالجة بياناتك وتخزينها في مراكز بيانات تقع خارج بلد إقامتك. نستخدم Supabase، والتي قد تخزن البيانات في مناطق مختلفة. باستخدام خدمتنا، فإنك توافق على مثل هذه التحويلات.',
    },
    policyUpdates: {
      title: 'تحديثات هذه السياسة',
      content: 'قد نحدث سياسة الخصوصية هذه من وقت لآخر. سنخطرك بالتغييرات المهمة عن طريق نشر السياسة الجديدة على هذه الصفحة وتحديث تاريخ "آخر تحديث". نشجعك على مراجعة هذه السياسة بشكل دوري.',
    },
    contact: {
      title: 'اتصل بنا',
      content: 'إذا كانت لديك أسئلة حول سياسة الخصوصية هذه أو ترغب في ممارسة حقوقك، يرجى الاتصال بنا على: privacy@egyptgoldpro.com',
    },
  },
};

export default function PrivacyPolicyContent() {
  const { lang } = useLang();
  const content = lang === 'ar' ? privacyPolicyAr : privacyPolicyEn;

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className={`flex flex-col sm:flex-row items-start sm:items-center ${lang === 'ar' ? 'sm:flex-row-reverse' : ''} gap-3 sm:gap-4 justify-between`}>
            <Link href="/" className={`flex items-center gap-3 sm:gap-4 flex-1 min-w-0 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                <Image
                  src="/brand/logo.png"
                  alt="EgyptGold Pro"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 640px) 48px, 56px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gold-400 truncate">
                  {content.title}
                </h1>
              </div>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-6 sm:py-8 lg:py-12">
        <div className="bg-gray-900 rounded-lg shadow-md p-6 sm:p-8 space-y-8">
          <div className={`text-sm text-gray-400 ${lang === 'ar' ? 'text-right' : ''}`}>
            {content.lastUpdated}
          </div>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.whoWeAre.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.whoWeAre.content}</p>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.dataCollection.title}</h2>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.dataCollection.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.whyWeCollect.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.whyWeCollect.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.whyWeCollect.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.legalBasis.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.legalBasis.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.legalBasis.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.dataSharing.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.dataSharing.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.dataSharing.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            {content.sections.dataSharing.note && (
              <p className="text-gray-400 italic mt-4">{content.sections.dataSharing.note}</p>
            )}
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.dataRetention.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.dataRetention.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.dataRetention.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.userRights.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.userRights.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.userRights.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.security.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.security.content}</p>
            <ul className={`space-y-2 text-gray-300 ${lang === 'ar' ? 'list-none' : 'list-disc'} ${lang === 'ar' ? 'pr-6' : 'pl-6'}`}>
              {content.sections.security.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            {content.sections.security.note && (
              <p className="text-gray-400 italic mt-4">{content.sections.security.note}</p>
            )}
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.internationalTransfers.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.internationalTransfers.content}</p>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.policyUpdates.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.policyUpdates.content}</p>
          </section>

          <section className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
            <h2 className="text-2xl font-bold text-gray-100">{content.sections.contact.title}</h2>
            <p className="text-gray-300 leading-relaxed">{content.sections.contact.content}</p>
          </section>

          <div className={`pt-8 border-t border-gray-800 ${lang === 'ar' ? 'text-right' : ''}`}>
            <Link
              href="/"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              {lang === 'ar' ? '← العودة للرئيسية' : '← Back to Home'}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

