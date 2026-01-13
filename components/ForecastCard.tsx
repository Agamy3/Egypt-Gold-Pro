/**
 * Market Forecast Card Component
 * 
 * Displays directional forecast with confidence and reasons
 * Includes time range and scope dropdowns with chart
 */

'use client';

import { useState, useEffect } from 'react';
import ForecastMiniChart from './ForecastMiniChart';
import { useLang } from './LanguageProvider';
import { t } from '@/lib/i18n';
import HoverTip from './ui/HoverTip';

interface ForecastData {
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  confidence: 'LOW' | 'MED' | 'HIGH';
  horizonMinutes: number;
  score: number;
  components: {
    momentum21k: number;
    varianceDelta: number;
    fxDelta: number;
    ounceDelta: number;
  };
  reasons: string[];
  snapshotCount: number;
}

interface ForecastCardProps {
  forecast?: ForecastData | null; // Optional - if not provided, component will fetch its own
  insufficientData?: boolean;
  country?: 'EG' | 'AE' | 'SA' | 'US';
  title?: string; // Optional custom title
}

interface SeriesPoint {
  t: number;
  v: number;
}

interface SeriesResponse {
  points: SeriesPoint[];
  meta: {
    scope: 'local' | 'global';
    range: string;
    unit: string;
  };
  error?: string;
}

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yoy';
type ForecastScope = 'local' | 'global';

const TIME_RANGE_MAP: Record<TimeRange, number> = {
  daily: 1440,      // 24 hours
  weekly: 10080,    // 7 days
  monthly: 43200,   // 30 days
  yoy: 525600,      // 365 days
};

export default function ForecastCard({ forecast: initialForecast, insufficientData: initialInsufficientData, country = 'EG', title }: ForecastCardProps) {
  const { lang } = useLang();
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [scope, setScope] = useState<ForecastScope>('local');
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Always manage forecast state internally - ignore initial props after first render
  const [forecast, setForecast] = useState<ForecastData | null>(initialForecast || null);
  const [insufficientData, setInsufficientData] = useState(initialInsufficientData || false);
  const [forecastLoading, setForecastLoading] = useState(false);
  
  const displayTitle = title || t(lang, 'marketForecast');

  // Fetch forecast when dropdowns or country change (always fetch, don't rely on props)
  useEffect(() => {
    const fetchForecast = async () => {
      try {
        setForecastLoading(true);
        const trustedMode = typeof window !== 'undefined' && localStorage.getItem('egyptTrustedOnlyMode') === 'true';
        const url = `/api/forecast?country=${country}&timeRange=${timeRange}&scope=${scope}${trustedMode ? '&trustedMode=true' : ''}`;
        
        const res = await fetch(url, {
          headers: {
            'x-trusted-mode': trustedMode ? 'true' : 'false',
          },
          cache: 'no-store',
        });
        
        if (!res.ok) {
          throw new Error('Failed to fetch forecast');
        }
        
        const data = await res.json();
        if (data.forecast) {
          setForecast(data.forecast);
          setInsufficientData(false);
        } else {
          setForecast(null);
          setInsufficientData(true);
        }
      } catch (err) {
        console.error('Failed to fetch forecast:', err);
        setForecast(null);
        setInsufficientData(true);
      } finally {
        setForecastLoading(false);
      }
    };

    fetchForecast();
  }, [timeRange, scope, country]);

  // Fetch series data when dropdowns change
  useEffect(() => {
    const fetchSeries = async () => {
      try {
        setLoading(true);
        // Get trusted mode preference from localStorage
        const trustedMode = typeof window !== 'undefined' && localStorage.getItem('egyptTrustedOnlyMode') === 'true';
        const minutes = TIME_RANGE_MAP[timeRange];
        
        const url = `/api/forecast/series?range=${timeRange}&minutes=${minutes}&scope=${scope}&country=${country}${trustedMode ? '&trustedMode=true' : ''}`;
        
        const res = await fetch(url, {
          headers: {
            'x-trusted-mode': trustedMode ? 'true' : 'false',
          },
          cache: 'no-store', // Ensure fresh data on every fetch
        });
        
        if (!res.ok) {
          throw new Error('Failed to fetch forecast series');
        }
        
        const data = await res.json();
        console.log('[ForecastCard] Series data received:', { 
          pointsCount: data.points?.length || 0, 
          meta: data.meta,
          error: data.error,
          firstPoint: data.points?.[0],
          lastPoint: data.points?.[data.points?.length - 1],
          samplePoints: data.points?.slice(0, 3)
        });
        setSeriesData(data);
      } catch (err) {
        console.error('Failed to fetch series:', err);
        setSeriesData({ points: [], meta: { scope, range: timeRange, unit: scope === 'global' ? 'USD' : 'EGP' } });
      } finally {
        setLoading(false);
      }
    };

    fetchSeries();
    
    // Also refresh series data every 30 seconds
    const interval = setInterval(() => {
      fetchSeries();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [timeRange, scope, country]);

  // Filter and transform reasons to remove provider names
  const cleanReasons = forecast?.reasons.map(reason => {
    return reason
      .replace(/\(GoldAPI\.com\)/gi, '')
      .replace(/GoldAPI\.com/gi, '')
      .replace(/gold-api\.com/gi, '')
      .replace(/open\.er-api\.com/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }) || [];

  const directionColors = {
    UP: 'text-green-600 border-green-500',
    DOWN: 'text-red-600 border-red-500',
    SIDEWAYS: 'text-yellow-600 border-yellow-500',
  };

  const confidenceColors = {
    HIGH: 'bg-green-100 text-green-800',
    MED: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-gray-100 text-gray-800',
  };

  const directionIcons = {
    UP: '↑',
    DOWN: '↓',
    SIDEWAYS: '→',
  };

  // Determine unit and range for chart based on country and scope
  const getCurrency = (country: string) => {
    return country === 'EG' ? 'EGP' : 
           country === 'AE' ? 'AED' :
           country === 'SA' ? 'SAR' :
           country === 'US' ? 'USD' : 'EGP';
  };
  const chartUnit = scope === 'global' ? 'USD' as const : (getCurrency(country) as 'EGP' | 'AED' | 'SAR' | 'USD');
  const chartRange = timeRange;

  if (insufficientData || !forecast || forecastLoading) {
    return (
      <div className={`bg-gray-900 rounded-lg shadow p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} border-gray-400`}>
        <div className={`flex items-center justify-between mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          <h3 className={`text-lg font-semibold text-gray-100 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            {displayTitle}
            <HoverTip text={lang === 'ar' ? 'التنبؤ بالاتجاه بناءً على تحليل الاتجاهات والزخم والانحرافات. يعتمد على بيانات السوق المحلية والعالمية.' : "Directional forecast based on trend analysis, momentum, and variance. Uses both local and global market data."}>
              <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </HoverTip>
          </h3>
          <span className="text-xs text-gray-400">{t(lang, 'next120')}</span>
        </div>
        <div className="text-center py-4">
          <p className="text-gray-300">{t(lang, 'insufficientData')}</p>
          <p className="text-sm text-gray-400 mt-2">{t(lang, 'recentSnapshots')}</p>
        </div>
        {/* Dropdowns and chart even if forecast is insufficient */}
        <div className="mt-4 pt-4 border-t space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-medium text-gray-300 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'timeRange')}</label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className={`w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${lang === 'ar' ? 'text-right' : ''}`}
              >
                <option value="daily">{t(lang, 'daily')}</option>
                <option value="weekly">{t(lang, 'weekly')}</option>
                <option value="monthly">{t(lang, 'monthly')}</option>
                <option value="yoy">{t(lang, 'yoy')}</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium text-gray-700 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'forecastScope')}</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as ForecastScope)}
                className={`w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${lang === 'ar' ? 'text-right' : ''}`}
              >
                <option value="local">{t(lang, 'localMarket')}</option>
                <option value="global">{t(lang, 'globalMarket')}</option>
              </select>
            </div>
          </div>
          <div className="w-full h-[240px] md:h-[340px] lg:h-[380px] relative" style={{ minHeight: '240px' }}>
            {seriesData ? (
              <ForecastMiniChart
                points={seriesData.points || []}
                unit={chartUnit}
                range={chartRange}
                loading={loading}
                strokeColor={scope === 'global' ? '#f59e0b' : '#3b82f6'}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                {loading ? t(lang, 'loading') : 'No chart data'}
              </div>
            )}
          </div>
        </div>
        <div className={`mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400 italic ${lang === 'ar' ? 'text-right' : ''}`}>
          {t(lang, 'forecastDisclaimer')}
        </div>
      </div>
    );
  }

  // Translate direction and confidence
  const getDirectionLabel = (dir: string) => {
    if (dir === 'UP') return t(lang, 'directionUp');
    if (dir === 'DOWN') return t(lang, 'directionDown');
    return t(lang, 'directionSideways');
  };

  const getConfidenceLabel = (conf: string) => {
    if (conf === 'HIGH') return t(lang, 'highConfidence');
    if (conf === 'MED') return t(lang, 'medConfidence');
    return t(lang, 'lowConfidence');
  };

  return (
    <div className={`bg-gray-900 rounded-lg shadow p-6 ${lang === 'ar' ? 'border-r-4' : 'border-l-4'} ${directionColors[forecast.direction]}`}>
      <div className={`flex items-center justify-between mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
        <h3 className={`text-lg font-semibold text-gray-800 inline-flex items-center gap-1 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          {displayTitle}
          <HoverTip text={lang === 'ar' ? 'التنبؤ بالاتجاه بناءً على تحليل الاتجاهات والزخم والانحرافات. يعتمد على بيانات السوق المحلية والعالمية.' : "Directional forecast based on trend analysis, momentum, and variance. Uses both local and global market data."}>
            <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </HoverTip>
        </h3>
        <span className="text-xs text-gray-500">{t(lang, 'next120')}</span>
      </div>

      <div className={`flex items-center gap-4 mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
        <div className="flex-1">
          <div className={`flex items-center gap-2 mb-2 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <span className="text-2xl font-bold">{directionIcons[forecast.direction]}</span>
            <span className={`text-xl font-bold ${directionColors[forecast.direction]}`}>
              {getDirectionLabel(forecast.direction)}
            </span>
          </div>
          <div className={`flex items-center gap-2 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
            <span className="text-sm text-gray-600">{t(lang, 'confidence')}:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${confidenceColors[forecast.confidence]}`}>
              {getConfidenceLabel(forecast.confidence)}
            </span>
          </div>
        </div>
        <div className={lang === 'ar' ? 'text-left' : 'text-right'}>
          <div className="text-2xl font-bold text-gray-100">{forecast.score}</div>
          <div className="text-xs text-gray-400">{t(lang, 'score')}</div>
        </div>
      </div>

      {cleanReasons.length > 0 && (
        <div className="mb-4">
          <h4 className={`text-sm font-semibold text-gray-300 mb-2 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'keyFactors')}:</h4>
          <ul className={`space-y-1 ${lang === 'ar' ? 'text-right' : ''}`}>
            {cleanReasons.map((reason, index) => (
              <li key={index} className={`text-sm text-gray-300 flex items-start ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                <span className={`text-gray-500 ${lang === 'ar' ? 'ml-2' : 'mr-2'}`}>•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dropdowns and Chart */}
      <div className="mt-4 pt-4 border-t space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`block text-xs font-medium text-gray-700 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'timeRange')}</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${lang === 'ar' ? 'text-right' : ''}`}
            >
              <option value="daily">{t(lang, 'daily')}</option>
              <option value="weekly">{t(lang, 'weekly')}</option>
              <option value="monthly">{t(lang, 'monthly')}</option>
              <option value="yoy">{t(lang, 'yoy')}</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium text-gray-700 mb-1 ${lang === 'ar' ? 'text-right' : ''}`}>{t(lang, 'forecastScope')}</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ForecastScope)}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${lang === 'ar' ? 'text-right' : ''}`}
            >
              <option value="local">{t(lang, 'localMarket')}</option>
              <option value="global">{t(lang, 'globalMarket')}</option>
            </select>
          </div>
        </div>

        <div className="w-full h-[240px] md:h-[340px] lg:h-[380px] relative" style={{ minHeight: '240px' }}>
          <ForecastMiniChart
            points={seriesData?.points || []}
            unit={chartUnit}
            range={chartRange}
            loading={loading}
            strokeColor={scope === 'global' ? '#f59e0b' : '#3b82f6'}
          />
        </div>
      </div>

      <div className={`mt-4 pt-4 border-t text-xs text-gray-500 italic ${lang === 'ar' ? 'text-right' : ''}`}>
        {t(lang, 'forecastDisclaimer')}
      </div>
    </div>
  );
}

