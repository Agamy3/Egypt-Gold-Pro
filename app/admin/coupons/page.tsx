/**
 * Admin Coupons Management Page
 * 
 * Admin-only page for managing coupon codes
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';

interface Coupon {
  id: number;
  code: string;
  active: boolean;
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  effect: any;
  created_at: string;
}

interface CouponFormData {
  code: string;
  active: boolean;
  max_redemptions: string;
  starts_at: string;
  ends_at: string;
  note: string;
  setPremium: boolean;
  adFree: boolean;
  days: string;
  premium_macro_explanations: boolean;
  gold_news_premium_filters: boolean;
  notifications_advanced: boolean;
}

export default function AdminCouponsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [formData, setFormData] = useState<CouponFormData>({
    code: '',
    active: true,
    max_redemptions: '',
    starts_at: '',
    ends_at: '',
    note: '',
    setPremium: false,
    adFree: false,
    days: '',
    premium_macro_explanations: false,
    gold_news_premium_filters: false,
    notifications_advanced: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const res = await fetch('/api/admin/coupons?limit=100');
      if (res.status === 403) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      if (res.ok) {
        setIsAdmin(true);
        const data = await res.json();
        setCoupons(data.coupons || []);
      }
      setLoading(false);
    } catch (error) {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const handleCreateCoupon = async () => {
    if (!formData.code.trim()) {
      setMessage({ type: 'error', text: 'Coupon code is required' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const effect: any = {};
      if (formData.setPremium) effect.setPremium = true;
      if (formData.adFree) effect.adFree = true;
      if (formData.days) effect.days = parseInt(formData.days);
      
      const entitlements: any = {};
      if (formData.premium_macro_explanations) entitlements.premium_macro_explanations = true;
      if (formData.gold_news_premium_filters) entitlements.gold_news_premium_filters = true;
      if (formData.notifications_advanced) entitlements.notifications_advanced = true;
      if (Object.keys(entitlements).length > 0) effect.entitlements = entitlements;

      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          active: formData.active,
          max_redemptions: formData.max_redemptions ? parseInt(formData.max_redemptions) : null,
          starts_at: formData.starts_at || null,
          ends_at: formData.ends_at || null,
          note: formData.note || null,
          effect,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Coupon created successfully' });
        setFormData({
          code: '',
          active: true,
          max_redemptions: '',
          starts_at: '',
          ends_at: '',
          note: '',
          setPremium: false,
          adFree: false,
          days: '',
          premium_macro_explanations: false,
          gold_news_premium_filters: false,
          notifications_advanced: false,
        });
        setShowCreateForm(false);
        checkAdmin();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create coupon' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !coupon.active }),
      });

      if (res.ok) {
        checkAdmin();
      }
    } catch (error) {
      console.error('Error toggling coupon:', error);
    }
  };

  const handleViewRedemptions = async (coupon: Coupon) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}/redemptions`);
      if (res.ok) {
        const data = await res.json();
        setRedemptions(data.redemptions || []);
        setSelectedCoupon(coupon);
      }
    } catch (error) {
      console.error('Error fetching redemptions:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-black">
        <header className="bg-gray-900 shadow-sm border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center">
                <span className="text-xl font-bold text-gold-400">EgyptGold Pro</span>
              </Link>
              <AccountMenu />
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
            <p className="text-gray-400 mb-8">You don't have permission to access this page.</p>
            <Link href="/" className="text-gold-400 hover:text-gold-300">
              Return to Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 shadow-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold text-gold-400">EgyptGold Pro</span>
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Coupon Management</h1>
          <p className="text-gray-400">Manage coupon codes for premium subscriptions</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-700 text-green-300'
              : 'bg-red-900/50 border border-red-700 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="mb-6">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold"
          >
            {showCreateForm ? 'Cancel' : '+ Create Coupon'}
          </button>
        </div>

        {showCreateForm && (
          <div className="bg-gray-900 rounded-lg shadow-md p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">Create New Coupon</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  placeholder="PREM2024"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Max Redemptions</label>
                  <input
                    type="number"
                    value={formData.max_redemptions}
                    onChange={(e) => setFormData({ ...formData, max_redemptions: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Days (Premium Duration)</label>
                  <input
                    type="number"
                    value={formData.days}
                    onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    placeholder="30"
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Starts At</label>
                  <input
                    type="datetime-local"
                    value={formData.starts_at}
                    onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Ends At</label>
                  <input
                    type="datetime-local"
                    value={formData.ends_at}
                    onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Note</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  placeholder="Internal note"
                />
              </div>
              <div className="border-t border-gray-700 pt-4">
                <p className="text-sm font-medium text-gray-300 mb-3">Effects</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.setPremium}
                      onChange={(e) => setFormData({ ...formData, setPremium: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Set Premium</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.adFree}
                      onChange={(e) => setFormData({ ...formData, adFree: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Ad Free</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.premium_macro_explanations}
                      onChange={(e) => setFormData({ ...formData, premium_macro_explanations: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Premium Macro Explanations</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.gold_news_premium_filters}
                      onChange={(e) => setFormData({ ...formData, gold_news_premium_filters: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Gold News Premium Filters</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.notifications_advanced}
                      onChange={(e) => setFormData({ ...formData, notifications_advanced: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Advanced Notifications</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-gray-300">Active</span>
                </label>
              </div>
              <button
                onClick={handleCreateCoupon}
                disabled={saving}
                className="px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Coupon'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-900 rounded-lg shadow-md border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Redemptions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Effect</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-white font-mono">{coupon.code}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        coupon.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }`}>
                        {coupon.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {coupon.redemption_count}
                      {coupon.max_redemptions && ` / ${coupon.max_redemptions}`}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {JSON.stringify(coupon.effect)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          {coupon.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleViewRedemptions(coupon)}
                          className="text-sm text-gold-400 hover:text-gold-300"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedCoupon && redemptions.length > 0 && (
          <div className="mt-8 bg-gray-900 rounded-lg shadow-md p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">
              Redemptions for {selectedCoupon.code}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Redeemed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {redemptions.map((redemption: any) => (
                    <tr key={redemption.id}>
                      <td className="px-4 py-3 text-gray-300">
                        {redemption.user_profiles?.email || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {new Date(redemption.redeemed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => {
                setSelectedCoupon(null);
                setRedemptions([]);
              }}
              className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md"
            >
              Close
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

