'use client';

import { useEffect, useState } from 'react';

// Toggle to show/hide source names (default: hidden)
const SHOW_SOURCE_NAMES = false;

interface DebugData {
  timestamp: number;
  impliedOunce: {
    status: string;
    price: number | null;
    source: 'gold-api.com' | null;
    ounceType: string;
    error: string | null;
  };
  dahabMasr: {
    status: string;
    url: string | null;
    httpStatus: number | null;
    prices: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
    };
    rawResponse: string | null;
    error: string | null;
  };
  goldBillion: {
    status: string;
    url: string | null;
    httpStatus: number | null;
    prices: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
    };
    rawResponse: string | null;
    error: string | null;
  };
  ta3weemDahabMasr: {
    status: string;
    url: string | null;
    httpStatus: number | null;
    prices: {
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
    };
    rawResponse: string | null;
    error: string | null;
  };
}

export default function SourceAuditPanel() {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSourceNames, setShowSourceNames] = useState(SHOW_SOURCE_NAMES);

  const fetchDebugData = async () => {
    try {
      const res = await fetch('/api/debug/sources');
      if (!res.ok) {
        throw new Error('Failed to fetch debug data');
      }
      const data = await res.json();
      setDebugData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebugData();
    const interval = setInterval(fetchDebugData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Source Audit Panel</h2>
        <p className="text-gray-600">Loading debug data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Source Audit Panel</h2>
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchDebugData}
          className="mt-4 px-4 py-2 bg-gold-600 text-white rounded hover:bg-gold-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!debugData) {
    return null;
  }

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('en-US');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK':
        return 'bg-green-100 text-green-800';
      case 'STALE':
      case 'ERROR':
        return status === 'STALE' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
      case 'DOWN':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="mt-8 bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Source Audit Panel</h2>
        <label className="flex items-center text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showSourceNames}
            onChange={(e) => setShowSourceNames(e.target.checked)}
            className="mr-2"
          />
          Show raw provider names
        </label>
      </div>

      {/* Egypt Market Implied Ounce */}
      <div className="mb-8 border-b border-gray-200 pb-6">
        <h3 className="text-lg font-semibold mb-4">Egypt Market Implied Ounce (USD)</h3>
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="font-medium w-32">Status:</span>
            <span className={`px-3 py-1 rounded ${getStatusColor(debugData.impliedOunce.status)}`}>
              {debugData.impliedOunce.status}
            </span>
          </div>
          <div>
            <span className="font-medium w-32 inline-block">Ounce Type:</span>
            <span className="px-3 py-1 rounded bg-purple-100 text-purple-800 font-semibold">
              {debugData.impliedOunce.ounceType || 'Egypt Market Implied'}
            </span>
          </div>
          {debugData.impliedOunce.source && (
            <div>
              <span className="font-medium w-32 inline-block">Source:</span>
              <span className="px-3 py-1 rounded font-semibold bg-green-100 text-green-800">
                {debugData.impliedOunce.source}
              </span>
            </div>
          )}
          {debugData.impliedOunce.price !== null ? (
            <>
              <div>
                <span className="font-medium w-32 inline-block">Value (USD):</span>
                <span className="font-mono font-bold text-lg">
                  ${debugData.impliedOunce.price.toFixed(2)}
                </span>
              </div>
            </>
          ) : (
            <div className="text-red-600 font-semibold">REFERENCE UNAVAILABLE</div>
          )}
          {debugData.impliedOunce.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              <div className="font-semibold">Error:</div>
              <div className="font-mono">{debugData.impliedOunce.error}</div>
            </div>
          )}
        </div>
      </div>

      {/* Dahab Masr */}
      <div className="mb-8 border-b border-gray-200 pb-6">
        <div className="flex items-center justify-between mb-4">
          {showSourceNames ? (
            <h3 className="text-lg font-semibold capitalize">Dahab Masr</h3>
          ) : (
            <h3 className="text-lg font-semibold">Source 1</h3>
          )}
          <span className={`px-3 py-1 rounded ${getStatusColor(debugData.dahabMasr.status)}`}>
            {debugData.dahabMasr.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-sm text-gray-600">21k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.dahabMasr.prices.market21Buy !== null
                ? `${debugData.dahabMasr.prices.market21Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">24k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.dahabMasr.prices.market24Buy !== null
                ? `${debugData.dahabMasr.prices.market24Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
        </div>

        {!debugData.dahabMasr.prices.market21Buy && 
         !debugData.dahabMasr.prices.market24Buy && (
          <div className="text-red-600 font-semibold mb-2">REFERENCE UNAVAILABLE</div>
        )}

        {debugData.dahabMasr.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            <div className="font-semibold">Error:</div>
            <div className="font-mono">{debugData.dahabMasr.error}</div>
          </div>
        )}

        {debugData.dahabMasr.rawResponse && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
              Raw HTML Response (first 800 chars)
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono overflow-auto max-h-48">
              {debugData.dahabMasr.rawResponse}
            </pre>
          </details>
        )}
      </div>

      {/* GoldBillion */}
      <div className="mb-8 border-b border-gray-200 pb-6">
        <div className="flex items-center justify-between mb-4">
          {showSourceNames ? (
            <h3 className="text-lg font-semibold capitalize">GoldBillion</h3>
          ) : (
            <h3 className="text-lg font-semibold">Source 2</h3>
          )}
          <span className={`px-3 py-1 rounded ${getStatusColor(debugData.goldBillion.status)}`}>
            {debugData.goldBillion.status}
          </span>
        </div>

        {showSourceNames && debugData.goldBillion.url && (
          <div className="mb-2">
            <span className="text-sm font-medium text-gray-600">URL:</span>
            <span className="ml-2 text-sm font-mono text-gray-800">{debugData.goldBillion.url}</span>
          </div>
        )}
        {showSourceNames && debugData.goldBillion.httpStatus && (
          <div className="mb-2">
            <span className="text-sm font-medium text-gray-600">HTTP Status:</span>
            <span className="ml-2 text-sm font-mono">{debugData.goldBillion.httpStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-sm text-gray-600">21k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.goldBillion.prices.market21Buy !== null
                ? `${debugData.goldBillion.prices.market21Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">24k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.goldBillion.prices.market24Buy !== null
                ? `${debugData.goldBillion.prices.market24Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
        </div>

        {!debugData.goldBillion.prices.market21Buy && 
         !debugData.goldBillion.prices.market24Buy && (
          <div className="text-red-600 font-semibold mb-2">REFERENCE UNAVAILABLE</div>
        )}

        {debugData.goldBillion.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            <div className="font-semibold">Error:</div>
            <div className="font-mono">{debugData.goldBillion.error}</div>
          </div>
        )}

        {debugData.goldBillion.rawResponse && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
              Raw HTML Response (first 800 chars)
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono overflow-auto max-h-48">
              {debugData.goldBillion.rawResponse}
            </pre>
          </details>
        )}
      </div>

      {/* Ta3weem DahabMasr */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          {showSourceNames ? (
            <h3 className="text-lg font-semibold capitalize">Ta3weem DahabMasr</h3>
          ) : (
            <h3 className="text-lg font-semibold">Source 3</h3>
          )}
          <span className={`px-3 py-1 rounded ${getStatusColor(debugData.ta3weemDahabMasr.status)}`}>
            {debugData.ta3weemDahabMasr.status}
          </span>
        </div>

        {showSourceNames && debugData.ta3weemDahabMasr.url && (
          <div className="mb-2">
            <span className="text-sm font-medium text-gray-600">URL:</span>
            <span className="ml-2 text-sm font-mono text-gray-800">{debugData.ta3weemDahabMasr.url}</span>
          </div>
        )}
        {showSourceNames && debugData.ta3weemDahabMasr.httpStatus !== null && debugData.ta3weemDahabMasr.httpStatus !== undefined && (
          <div className="mb-2">
            <span className="text-sm font-medium text-gray-600">HTTP Status:</span>
            <span className="ml-2 text-sm font-mono">{debugData.ta3weemDahabMasr.httpStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-sm text-gray-600">21k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.ta3weemDahabMasr.prices.market21Buy !== null
                ? `${debugData.ta3weemDahabMasr.prices.market21Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">24k Buy</div>
            <div className="font-mono font-semibold">
              {debugData.ta3weemDahabMasr.prices.market24Buy !== null
                ? `${debugData.ta3weemDahabMasr.prices.market24Buy.toFixed(0)} EGP`
                : 'N/A'}
            </div>
          </div>
        </div>

        {!debugData.ta3weemDahabMasr.prices.market21Buy && 
         !debugData.ta3weemDahabMasr.prices.market24Buy && (
          <div className="text-red-600 font-semibold mb-2">REFERENCE UNAVAILABLE</div>
        )}

        {debugData.ta3weemDahabMasr.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            <div className="font-semibold">Error:</div>
            <div className="font-mono">{debugData.ta3weemDahabMasr.error}</div>
          </div>
        )}

        {debugData.ta3weemDahabMasr.rawResponse && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
              Raw HTML Response (first 800 chars)
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono overflow-auto max-h-48">
              {debugData.ta3weemDahabMasr.rawResponse}
            </pre>
          </details>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-500">
        Last refreshed: {formatTimestamp(debugData.timestamp)}
      </div>
    </div>
  );
}
