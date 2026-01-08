'use client';

import { useEffect, useState } from 'react';

interface QAResult {
  sourceId: number;
  score: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  prices: {
    market21Buy: number | null;
    market21Sell: number | null;
    market24Buy: number | null;
    market24Sell: number | null;
  };
  ratio21to24: number | null;
  spread21Pct: number | null;
  spread24Pct: number | null;
  httpStatus: number | null;
  fetchedAt: number;
}

interface QAResponse {
  timestamp: number;
  testedSourceIds: number[];
  results: QAResult[];
  bestSource: number | null;
}

export default function QAPage() {
  const [qaData, setQaData] = useState<QAResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQAData();
  }, []);

  const fetchQAData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/qa/rapidapi');
      if (!response.ok) {
        throw new Error(`QA fetch failed: ${response.statusText}`);
      }
      const data = await response.json();
      setQaData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">RapidAPI Source QA</h1>
          <p className="text-gray-600">Loading QA results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">RapidAPI Source QA</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!qaData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">RapidAPI Source QA</h1>
          <p className="text-gray-600 mb-4">
            Quality assurance results for RapidAPI Egyptian Gold Data sources
          </p>
          {qaData.bestSource && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-blue-800 font-semibold">
                Best Source: ID {qaData.bestSource} (Score: {qaData.results[0]?.score || 0})
              </p>
              <p className="text-sm text-blue-600 mt-1">
                Pick the source that matches iSagha/GoldBillion best.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  21k Buy/Sell
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  24k Buy/Sell
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ratio (21/24)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Spread
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {qaData.results.map((result) => (
                <tr
                  key={result.sourceId}
                  className={result.valid ? 'bg-green-50' : result.score > 50 ? 'bg-yellow-50' : 'bg-red-50'}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {result.sourceId}
                    {qaData.bestSource === result.sourceId && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        BEST
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className={`font-semibold ${result.score >= 80 ? 'text-green-600' : result.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {result.score}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {result.valid ? (
                      <span className="text-green-800 font-semibold">Valid</span>
                    ) : (
                      <span className="text-red-800 font-semibold">Invalid</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {result.prices.market21Buy !== null && result.prices.market21Sell !== null ? (
                      <>
                        {result.prices.market21Buy.toFixed(2)} / {result.prices.market21Sell.toFixed(2)}
                      </>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {result.prices.market24Buy !== null && result.prices.market24Sell !== null ? (
                      <>
                        {result.prices.market24Buy.toFixed(2)} / {result.prices.market24Sell.toFixed(2)}
                      </>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {result.ratio21to24 !== null ? (
                      <span className={result.ratio21to24 >= 0.84 && result.ratio21to24 <= 0.90 ? 'text-green-600' : 'text-red-600'}>
                        {result.ratio21to24.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {result.spread21Pct !== null && result.spread24Pct !== null ? (
                      <>
                        21k: {result.spread21Pct.toFixed(2)}%<br />
                        24k: {result.spread24Pct.toFixed(2)}%
                      </>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {result.errors.length > 0 && (
                      <div className="mb-2">
                        <div className="font-semibold text-red-800">Errors:</div>
                        <ul className="list-disc list-inside text-red-600">
                          {result.errors.map((err, idx) => (
                            <li key={idx} className="text-xs">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.warnings.length > 0 && (
                      <div>
                        <div className="font-semibold text-yellow-800">Warnings:</div>
                        <ul className="list-disc list-inside text-yellow-600">
                          {result.warnings.map((warn, idx) => (
                            <li key={idx} className="text-xs">{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.errors.length === 0 && result.warnings.length === 0 && (
                      <span className="text-green-600">✓ No issues</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-sm text-gray-600">
          <p>
            <strong>Note:</strong> Pick the source that matches iSagha/GoldBillion best. 
            Scores are calculated based on validation checks (ratio, ranges, spreads, etc.).
          </p>
          <p className="mt-2">
            Last updated: {new Date(qaData.timestamp).toLocaleString()}
          </p>
        </div>

        <div className="mt-4">
          <button
            onClick={fetchQAData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Refresh QA Results
          </button>
        </div>
      </div>
    </div>
  );
}


