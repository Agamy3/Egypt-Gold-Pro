'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SeriesPoint {
  t: number;
  ounceUsd: number | null; // Global ounce price (XAU/USD)
  market21Buy: number | null;
  fair21: number | null;
  variancePct: number | null;
}

interface ForecastSeriesData {
  timestamp: number;
  minutes: number;
  points: SeriesPoint[];
  error?: string;
}

interface ForecastChartProps {
  minutes?: number; // Default 120
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ForecastChart({ minutes = 120 }: ForecastChartProps) {
  const [seriesData, setSeriesData] = useState<ForecastSeriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSeries = async () => {
      try {
        setLoading(true);
        // Get trusted mode preference from localStorage
        const trustedMode = localStorage.getItem('egyptTrustedOnlyMode') === 'true';
        const url = `/api/forecast/series?minutes=${minutes}${trustedMode ? '&trustedMode=true' : ''}`;
        
        const res = await fetch(url, {
          headers: {
            'x-trusted-mode': trustedMode ? 'true' : 'false',
          },
        });
        if (!res.ok) {
          throw new Error('Failed to fetch forecast series');
        }
        const data = await res.json();
        setSeriesData(data);
        setError(data.error || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSeries();
    // Refresh every 30 seconds (same as main dashboard)
    const interval = setInterval(fetchSeries, 30000);
    return () => clearInterval(interval);
  }, [minutes]);

  if (loading) {
    return (
      <div className="w-full h-[280px] md:h-[340px] lg:h-[420px] flex items-center justify-center text-gray-500 text-sm overflow-hidden">
        Loading chart data...
      </div>
    );
  }

  if (error || !seriesData || seriesData.points.length === 0) {
    return (
      <div className="w-full h-[280px] md:h-[340px] lg:h-[420px] flex flex-col items-center justify-center text-gray-500 text-sm overflow-hidden">
        <span>Insufficient data for graph</span>
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>
    );
  }

  // Transform data for recharts
  const chartData = seriesData.points.map((point) => ({
    time: formatTime(point.t),
    timestamp: point.t,
    ounceUsd: point.ounceUsd,
    market21Buy: point.market21Buy,
    fair21: point.fair21,
    variancePct: point.variancePct !== null ? point.variancePct.toFixed(2) : null,
  }));

  // Filter out points without ounce data
  const validChartData = chartData.filter(d => d.ounceUsd !== null);

  if (validChartData.length === 0) {
    return (
      <div className="w-full h-[280px] md:h-[340px] lg:h-[420px] flex items-center justify-center text-gray-500 text-sm overflow-hidden">
        Insufficient data for graph (no global ounce data available)
      </div>
    );
  }

  // Find min/max for Y-axis range based on ounce prices
  const allOuncePrices = validChartData
    .map(d => d.ounceUsd)
    .filter(v => v !== null && isFinite(v)) as number[];
  
  const minPrice = allOuncePrices.length > 0 ? Math.min(...allOuncePrices) * 0.995 : 0;
  const maxPrice = allOuncePrices.length > 0 ? Math.max(...allOuncePrices) * 1.005 : 5000;

  return (
    <div className="mt-4 w-full h-[280px] md:h-[340px] lg:h-[420px] overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={validChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: '#6b7280' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: '#6b7280' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
            label={{ value: 'USD/oz', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '8px',
            }}
            formatter={(value: any, name?: string | number) => {
              const key = name != null ? String(name) : '';
              if (key === 'ounceUsd') {
                return [`$${value?.toFixed(2) ?? 'N/A'}`, 'Global Ounce (XAU/USD)'];
              }
              if (key === 'market21Buy') {
                return [`${value?.toFixed(0) ?? 'N/A'} EGP`, 'Market 21k'];
              }
              if (key === 'fair21') {
                return [`${value?.toFixed(0) ?? 'N/A'} EGP`, 'Fair 21k'];
              }
              if (key === 'variancePct') {
                return [`${value ?? 'N/A'}%`, 'Variance'];
              }
              return [value, name];
            }}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="ounceUsd"
            name="Global Ounce (XAU/USD)"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Last {seriesData.minutes} minutes • {seriesData.points.length} data points
      </div>
    </div>
  );
}

