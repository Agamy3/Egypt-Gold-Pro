'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './ui/Modal';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';
type Karat = 14 | 18 | 21 | 24;

interface Holding {
  id: number;
  country: Country | null;
  karat: Karat;
  grams: number;
  purchase_price_per_gram: number;
  purchase_currency: Currency;
  purchased_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  invested_value_selected: number;
  current_value_selected: number;
  current_price_per_gram_selected: number | null;
  pnl: number;
  pnl_pct: number;
  status: 'WIN' | 'LOSS' | 'FLAT';
}

interface PortfolioTableProps {
  holdings: Holding[];
  currency: Currency;
  country: Country;
  lang: 'en' | 'ar';
  onRefresh: () => void;
}

function formatNumber(num: number | null, decimals = 2): string {
  if (num === null) return 'N/A';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(num: number | null, currency: Currency, decimals = 2): string {
  if (num === null) return 'N/A';
  const symbol = currency === 'EGP' ? 'EGP' : currency === 'AED' ? 'AED' : currency === 'SAR' ? 'SAR' : '$';
  return `${symbol} ${formatNumber(num, decimals)}`;
}

export default function PortfolioTable({ holdings, currency, country, lang, onRefresh }: PortfolioTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    karat: 24 as Karat,
    grams: '',
    purchasePricePerGram: '',
    purchaseCurrency: 'EGP' as Currency,
    purchasedAt: '',
    notes: '',
    country: country as Country | '',
  });

  const handleOpenModal = () => {
    console.log('Add button clicked - opening modal');
    setShowAddForm(true);
    setError(null);
  };

  const handleCloseModal = () => {
    setShowAddForm(false);
    setEditingHolding(null);
    setError(null);
    // Reset form
    setFormData({
      karat: 24,
      grams: '',
      purchasePricePerGram: '',
      purchaseCurrency: 'EGP',
      purchasedAt: '',
      notes: '',
      country: country,
    });
  };

  const handleEdit = (holding: Holding) => {
    setEditingHolding(holding);
    setFormData({
      karat: holding.karat,
      grams: holding.grams.toString(),
      purchasePricePerGram: holding.purchase_price_per_gram.toString(),
      purchaseCurrency: holding.purchase_currency,
      purchasedAt: holding.purchased_at || '',
      notes: holding.notes || '',
      country: holding.country || country,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (holdingId: number) => {
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا الاستثمار؟' : 'Are you sure you want to delete this holding?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/${holdingId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete holding');
      }

      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (![14, 18, 21, 24].includes(formData.karat)) {
      return lang === 'ar' ? 'العيار غير صالح' : 'Invalid karat';
    }
    const grams = parseFloat(formData.grams);
    if (isNaN(grams) || grams <= 0) {
      return lang === 'ar' ? 'الجرامات يجب أن تكون رقمًا أكبر من الصفر' : 'Grams must be a number greater than zero';
    }
    const price = parseFloat(formData.purchasePricePerGram);
    if (isNaN(price) || price <= 0) {
      return lang === 'ar' ? 'سعر الشراء يجب أن يكون رقمًا أكبر من الصفر' : 'Purchase price must be a number greater than zero';
    }
    if (!['EGP', 'USD', 'AED', 'SAR'].includes(formData.purchaseCurrency)) {
      return lang === 'ar' ? 'العملة غير صالحة' : 'Invalid currency';
    }
    if (formData.country && !['EG', 'AE', 'SA', 'US'].includes(formData.country)) {
      return lang === 'ar' ? 'البلد غير صالح' : 'Invalid country';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submit triggered');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        karat: formData.karat,
        grams: parseFloat(formData.grams),
        purchasePricePerGram: parseFloat(formData.purchasePricePerGram),
        purchaseCurrency: formData.purchaseCurrency,
      };

      if (formData.purchasedAt) {
        payload.purchasedAt = formData.purchasedAt;
      }
      if (formData.notes.trim()) {
        payload.notes = formData.notes.trim();
      }
      if (formData.country) {
        payload.country = formData.country;
      }

      let res;
      if (editingHolding) {
        // Update existing holding
        res = await fetch(`/api/portfolio/${editingHolding.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new holding
        res = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (editingHolding ? 'Failed to update holding' : 'Failed to create holding'));
      }

      // Success - close modal and refresh
      handleCloseModal();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-gray-900 rounded-lg shadow-md p-4 sm:p-6">
        <div className={`flex items-center justify-between mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          <h2 className={`text-lg font-semibold text-gray-100 ${lang === 'ar' ? 'text-right' : ''}`}>
            {lang === 'ar' ? 'الاستثمارات' : 'Holdings'}
          </h2>
          <button
            type="button"
            onClick={handleOpenModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            {lang === 'ar' ? '+ إضافة' : '+ Add'}
          </button>
        </div>

        {holdings.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {lang === 'ar' ? 'لا توجد استثمارات. ابدأ بإضافة استثمار جديد.' : 'No holdings. Start by adding a new holding.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'العيار' : 'Karat'}
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'الجرامات' : 'Grams'}
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'سعر الشراء' : 'Buy Price'}
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'القيمة الحالية' : 'Current Value'}
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'ربح/خسارة' : 'P/L'}
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold text-gray-300 ${lang === 'ar' ? 'text-right' : ''}`}>
                    {lang === 'ar' ? 'الإجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr key={holding.id} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="py-3 px-4 text-sm text-gray-300">{holding.karat}k</td>
                    <td className="py-3 px-4 text-sm text-gray-300">{formatNumber(holding.grams, 2)}</td>
                    <td className="py-3 px-4 text-sm text-gray-300">
                      {formatCurrency(holding.purchase_price_per_gram, holding.purchase_currency)} / {lang === 'ar' ? 'جرام' : 'gram'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-300">
                      {formatCurrency(holding.current_value_selected, currency)}
                    </td>
                    <td className={`py-3 px-4 text-sm font-medium ${
                      holding.status === 'WIN' ? 'text-green-400' :
                      holding.status === 'LOSS' ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {formatCurrency(holding.pnl, currency)} ({formatNumber(holding.pnl_pct * 100, 2)}%)
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleEdit(holding)}
                        disabled={loading}
                        className="text-blue-400 hover:text-blue-300 text-sm mr-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {lang === 'ar' ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(holding.id)}
                        disabled={loading}
                        className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {lang === 'ar' ? 'حذف' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddForm}
        onClose={handleCloseModal}
        title={editingHolding ? (lang === 'ar' ? 'تعديل الاستثمار' : 'Edit Holding') : (lang === 'ar' ? 'إضافة استثمار جديد' : 'Add New Holding')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900 bg-opacity-50 border border-red-600 text-red-200 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'العيار' : 'Karat'} *
            </label>
            <select
              value={formData.karat}
              onChange={(e) => handleInputChange('karat', parseInt(e.target.value) as Karat)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={14}>14k</option>
              <option value={18}>18k</option>
              <option value={21}>21k</option>
              <option value={24}>24k</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'الجرامات' : 'Grams'} *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.grams}
              onChange={(e) => handleInputChange('grams', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'سعر الشراء لكل جرام' : 'Purchase Price per Gram'} *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.purchasePricePerGram}
              onChange={(e) => handleInputChange('purchasePricePerGram', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'عملة الشراء' : 'Purchase Currency'} *
            </label>
            <select
              value={formData.purchaseCurrency}
              onChange={(e) => handleInputChange('purchaseCurrency', e.target.value as Currency)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
              <option value="SAR">SAR</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'} (optional)
            </label>
            <input
              type="date"
              value={formData.purchasedAt}
              onChange={(e) => handleInputChange('purchasedAt', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'الملاحظات' : 'Notes'} (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {lang === 'ar' ? 'البلد' : 'Country'} (optional)
            </label>
            <select
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{lang === 'ar' ? 'اختر البلد' : 'Select Country'}</option>
              <option value="EG">Egypt (EG)</option>
              <option value="AE">UAE (AE)</option>
              <option value="SA">Saudi Arabia (SA)</option>
              <option value="US">USA (US)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md transition-colors"
              disabled={loading}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

