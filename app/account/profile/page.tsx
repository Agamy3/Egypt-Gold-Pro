'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider';
import { createClientSupabaseClient } from '@/lib/supabase/client-auth';

export default function ProfilePage() {
  const { lang } = useLang();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }
      setUser(user);
      
      // Fetch profile
      fetch('/api/profile/preferences')
        .then(res => res.json())
        .then(data => {
          setProfile(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        alert(lang === 'ar' ? 'تم الحفظ' : 'Saved!');
      }
    } catch (err) {
      alert(lang === 'ar' ? 'حدث خطأ' : 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="text-blue-400 hover:text-blue-300 mb-4 inline-block">
          ← {lang === 'ar' ? 'العودة' : 'Back'}
        </Link>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h1 className={`text-2xl font-bold text-gray-100 mb-6 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'الملف الشخصي' : 'Profile'}
          </h1>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium text-gray-300 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>
                {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-400 cursor-not-allowed"
              />
            </div>
            <div className="pt-4 border-t border-gray-800">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-md"
              >
                {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

