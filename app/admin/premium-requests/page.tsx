/**
 * Admin Premium Requests Page
 * 
 * Admin-only page for managing premium access requests
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountMenu from '@/components/AccountMenu';
import Footer from '@/components/Footer';

interface PremiumRequest {
  id: number;
  user_id: string | null;
  email: string;
  country: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminPremiumRequestsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<PremiumRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [premiumDays, setPremiumDays] = useState('30');
  const [adminNote, setAdminNote] = useState('');
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
      if (data.isAdmin) {
        setIsAdmin(true);
        loadRequests();
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    } catch (error) {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/admin/premium-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data || []);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/premium-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          premium_days: parseInt(premiumDays) || 30,
          admin_note: adminNote || null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setMessage({ type: 'success', text: 'Request approved successfully' });
        setApprovingId(null);
        setPremiumDays('30');
        setAdminNote('');
        loadRequests();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to approve request' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const handleReject = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/premium-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          admin_note: adminNote || null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setMessage({ type: 'success', text: 'Request rejected' });
        setRejectingId(null);
        setAdminNote('');
        loadRequests();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reject request' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-900 text-yellow-300',
      approved: 'bg-green-900 text-green-300',
      rejected: 'bg-red-900 text-red-300',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[status as keyof typeof colors]}`}>
        {status.toUpperCase()}
      </span>
    );
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
            <p className="text-gray-400 mb-8">You don&apos;t have permission to access this page.</p>
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
          <h1 className="text-3xl font-bold text-white mb-2">Premium Requests</h1>
          <p className="text-gray-400">Manage premium access requests</p>
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

        <div className="bg-gray-900 rounded-lg shadow-md border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Country</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Message</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-white">{request.email}</td>
                    <td className="px-4 py-3 text-gray-300">{request.country || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{request.message || 'N/A'}</td>
                    <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {request.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setApprovingId(request.id)}
                            className="text-sm text-green-400 hover:text-green-300"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(request.id)}
                            className="text-sm text-red-400 hover:text-red-300"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Approve Modal */}
        {approvingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
              <h2 className="text-xl font-bold text-white mb-4">Approve Request</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Premium Days</label>
                  <input
                    type="number"
                    value={premiumDays}
                    onChange={(e) => setPremiumDays(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Admin Note (optional)</label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(approvingId)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setApprovingId(null);
                      setPremiumDays('30');
                      setAdminNote('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
              <h2 className="text-xl font-bold text-white mb-4">Reject Request</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Admin Note (optional)</label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(rejectingId)}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      setRejectingId(null);
                      setAdminNote('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

