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
  description: string | null;
  is_active: boolean;
  max_redemptions: number | null;
  redeemed_count: number;
  starts_at: string | null;
  expires_at: string | null;
  grants_premium: boolean;
  premium_days: number | null;
  unlock_features: string[] | null;
  created_at: string;
}

export default function AdminCouponsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    premium_days: '',
    max_redemptions: '',
    starts_at: '',
    expires_at: '',
    grants_premium: true,
    unlock_features: '',
  });

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
      if (data.isAdmin) {
        setIsAdmin(true);
        loadCoupons();
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    } catch (error) {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const loadCoupons = async () => {
    try {
      const res = await fetch('/api/admin/coupons');
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.data || []);
      }
    } catch (error) {
      console.error('Error loading coupons:', error);
    }
  };

  const handleCreateCoupon = async () => {
    if (!formData.code.trim()) {
      setMessage({ type: 'error', text: 'Coupon code is required' });
      return;
    }

    try {
      const unlockFeatures = formData.unlock_features.trim()
        ? formData.unlock_features.split(',').map(f => f.trim()).filter(Boolean)
        : null;

      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          description: formData.description || null,
          premium_days: formData.premium_days ? parseInt(formData.premium_days) : null,
          max_redemptions: formData.max_redemptions ? parseInt(formData.max_redemptions) : null,
          starts_at: formData.starts_at || null,
          expires_at: formData.expires_at || null,
          grants_premium: formData.grants_premium,
          unlock_features: unlockFeatures,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setMessage({ type: 'success', text: 'Coupon created successfully' });
        setFormData({
          code: '',
          description: '',
          premium_days: '',
          max_redemptions: '',
          starts_at: '',
          expires_at: '',
          grants_premium: true,
          unlock_features: '',
        });
        setShowCreateForm(false);
        loadCoupons();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create coupon' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !coupon.is_active }),
      });

      if (res.ok) {
        loadCoupons();
      }
    } catch (error) {
      console.error('Error toggling coupon:', error);
    }
  };

  const handleEditCoupon = async () => {
    if (!editingCoupon) return;

    try {
      const unlockFeatures = formData.unlock_features.trim()
        ? formData.unlock_features.split(',').map(f => f.trim()).filter(Boolean)
        : null;

      const res = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: formData.description || null,
          premium_days: formData.premium_days ? parseInt(formData.premium_days) : null,
          max_redemptions: formData.max_redemptions ? parseInt(formData.max_redemptions) : null,
          starts_at: formData.starts_at || null,
          expires_at: formData.expires_at || null,
          grants_premium: formData.grants_premium,
          unlock_features: unlockFeatures,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setMessage({ type: 'success', text: 'Coupon updated successfully' });
        setEditingCoupon(null);
        loadCoupons();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update coupon' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setMessage({ type: 'success', text: `Copied ${code} to clipboard` });
    setTimeout(() => setMessage(null), 2000);
  };

  const startEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      premium_days: coupon.premium_days?.toString() || '',
      max_redemptions: coupon.max_redemptions?.toString() || '',
      starts_at: coupon.starts_at ? coupon.starts_at.substring(0, 16) : '',
      expires_at: coupon.expires_at ? coupon.expires_at.substring(0, 16) : '',
      grants_premium: coupon.grants_premium,
      unlock_features: coupon.unlock_features?.join(', ') || '',
    });
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
            <h1 className="text-3xl font-bold text-white mb-4">Not Authorized</h1>
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
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setEditingCoupon(null);
            }}
            className="px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold"
          >
            {showCreateForm ? 'Cancel' : '+ Create Coupon'}
          </button>
        </div>

        {(showCreateForm || editingCoupon) && (
          <div className="bg-gray-900 rounded-lg shadow-md p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  disabled={!!editingCoupon}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white disabled:opacity-50"
                  placeholder="PREM2024"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  placeholder="Optional description"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Premium Days (blank = lifetime)</label>
                  <input
                    type="number"
                    value={formData.premium_days}
                    onChange={(e) => setFormData({ ...formData, premium_days: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Max Redemptions (blank = unlimited)</label>
                  <input
                    type="number"
                    value={formData.max_redemptions}
                    onChange={(e) => setFormData({ ...formData, max_redemptions: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    placeholder="100"
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
                  <label className="block text-sm font-medium text-gray-300 mb-1">Expires At</label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Unlock Features (comma-separated)</label>
                <input
                  type="text"
                  value={formData.unlock_features}
                  onChange={(e) => setFormData({ ...formData, unlock_features: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                  placeholder="advanced_macro, premium_news"
                />
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.grants_premium}
                    onChange={(e) => setFormData({ ...formData, grants_premium: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-gray-300">Grants Premium</span>
                </label>
              </div>
              <button
                onClick={editingCoupon ? handleEditCoupon : handleCreateCoupon}
                className="px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white rounded-md font-semibold"
              >
                {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Premium Days</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono">{coupon.code}</span>
                        <button
                          onClick={() => copyCode(coupon.code)}
                          className="text-xs text-gray-400 hover:text-gray-300"
                          title="Copy code"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        coupon.is_active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }`}>
                        {coupon.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {coupon.redeemed_count}
                      {coupon.max_redemptions && ` / ${coupon.max_redemptions}`}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {coupon.premium_days || 'Lifetime'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(coupon.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          {coupon.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => startEdit(coupon)}
                          className="text-sm text-gold-400 hover:text-gold-300"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
