'use client';

import { useLang } from './LanguageProvider';
import Footer from './Footer';
import Link from 'next/link';
import Image from 'next/image';

const termsEn = {
  title: 'Terms of Service',
  lastUpdated: 'Last Updated: January 2025',
  content: {
    intro: 'By using EgyptGold Pro, you agree to these Terms of Service. If you do not agree, please do not use our service.',
    acceptance: {
      title: 'Acceptance of Terms',
      text: 'By accessing or using EgyptGold Pro, you agree to be bound by these Terms of Service and all applicable laws and regulations.',
    },
    service: {
      title: 'Service Description',
      text: 'EgyptGold Pro provides educational information about gold market prices, portfolio tracking, and related analytics. This service is for informational purposes only and does not constitute financial advice.',
    },
    userAccount: {
      title: 'User Accounts',
      text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
    },
    disclaimer: {
      title: 'Disclaimer',
      text: 'The information provided on EgyptGold Pro is for educational purposes only. We do not guarantee the accuracy, completeness, or timeliness of any information. You should not rely on this information as the sole basis for making financial decisions.',
    },
    limitations: {
      title: 'Limitation of Liability',
      text: 'To the fullest extent permitted by law, EgyptGold Pro shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.',
    },
    changes: {
      title: 'Changes to Terms',
      text: 'We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.',
    },
    contact: {
      title: 'Contact',
      text: 'For questions about these terms, contact us at: privacy@egyptgoldpro.com',
    },
  },
};

const termsAr = {
  title: 'شروط الخدمة',
  lastUpdated: 'آخر تحديث: يناير 2025',
  content: {
    intro: 'باستخدام EgyptGold Pro، فإنك توافق على شروط الخدمة هذه. إذا كنت لا توافق، يرجى عدم استخدام خدمتنا.',
    acceptance: {
      title: 'قبول الشروط',
      text: 'من خلال الوصول إلى أو استخدام EgyptGold Pro، فإنك توافق على الالتزام بشروط الخدمة هذه وجميع القوانين واللوائح المعمول بها.',
    },
    service: {
      title: 'وصف الخدمة',
      text: 'يوفر EgyptGold Pro معلومات تعليمية حول أسعار سوق الذهب، تتبع المحفظة، والتحليلات ذات الصلة. هذه الخدمة لأغراض إعلامية فقط ولا تشكل نصيحة مالية.',
    },
    userAccount: {
      title: 'حسابات المستخدمين',
      text: 'أنت مسؤول عن الحفاظ على سرية بيانات اعتماد حسابك وعن جميع الأنشطة التي تحدث تحت حسابك.',
    },
    disclaimer: {
      title: 'إخلاء المسؤولية',
      text: 'المعلومات المقدمة على EgyptGold Pro هي لأغراض تعليمية فقط. لا نضمن دقة أو اكتمال أو توقيت أي معلومات. لا يجب أن تعتمد على هذه المعلومات كأساس وحيد لاتخاذ قرارات مالية.',
    },
    limitations: {
      title: 'تحديد المسؤولية',
      text: 'إلى أقصى حد يسمح به القانون، لن تكون EgyptGold Pro مسؤولة عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية ناتجة عن استخدامك للخدمة.',
    },
    changes: {
      title: 'تغييرات الشروط',
      text: 'نحتفظ بالحق في تعديل هذه الشروط في أي وقت. الاستمرار في استخدام الخدمة بعد التغييرات يشكل قبول الشروط الجديدة.',
    },
    contact: {
      title: 'اتصل بنا',
      text: 'للأسئلة حول هذه الشروط، اتصل بنا على: support@egyptgoldpro.com',
    },
  },
};

export default function TermsContent() {
  const { lang } = useLang();
  const content = lang === 'ar' ? termsAr : termsEn;

  return (
    <div className="min-h-screen bg-black flex flex-col">
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

          <p className={`text-gray-300 leading-relaxed ${lang === 'ar' ? 'text-right' : ''}`}>
            {content.content.intro}
          </p>

          {Object.entries(content.content).filter(([key]) => key !== 'intro').map(([key, section]: [string, any]) => (
            <section key={key} className={`space-y-4 ${lang === 'ar' ? 'text-right' : ''}`}>
              <h2 className="text-2xl font-bold text-gray-100">{section.title}</h2>
              <p className="text-gray-300 leading-relaxed">{section.text}</p>
            </section>
          ))}

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

