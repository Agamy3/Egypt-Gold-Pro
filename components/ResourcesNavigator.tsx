'use client';

import { useLang } from '@/components/LanguageProvider';
import { t } from '@/lib/i18n';

interface ResourcesNavigatorProps {
  impliedOunce?: {
    source: string;
    timestamp: number;
    stale: boolean;
  } | null;
  fx?: {
    source: string;
    fetchedAt: number | null;
    stale: boolean;
    error?: string;
  } | null;
  egyptMarket?: {
    sources: Array<{
      source: string;
      status: string;
      fetchedAt: number;
    }>;
    activeSourceCount: number;
    activeUnderlyingSourceCount?: number;
    activeUnderlyingSources?: number | string[];
    sourcesUsed?: Record<string, string[]>;
  } | null;
}

export default function ResourcesNavigator({
  impliedOunce,
  fx,
  egyptMarket,
}: ResourcesNavigatorProps) {
  const { lang } = useLang();
  const isRTL = lang === 'ar';

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'OK':
        return 'text-green-400';
      case 'STALE':
        return 'text-yellow-400';
      case 'DOWN':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    const color = getStatusColor(status);
    return (
      <span className={`text-xs font-semibold ${color}`}>
        {status}
      </span>
    );
  };

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = Date.now();
    const minutesAgo = Math.floor((now - timestamp) / (60 * 1000));
    
    if (minutesAgo < 1) return 'Just now';
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <h2 className={`text-xl font-bold text-gold-400 mb-4 ${isRTL ? 'text-right' : ''}`}>
        {t(lang, 'resources') || 'Data Sources'}
      </h2>

      <div className="space-y-4">
        {/* Gold Price Source */}
        <div className={`border-b border-gray-800 pb-4 ${isRTL ? 'text-right' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              {t(lang, 'goldPrice') || 'Gold Price (XAU/USD)'}
            </h3>
            {impliedOunce && getStatusBadge(impliedOunce.stale ? 'STALE' : 'OK')}
          </div>
          <div className="text-sm text-gray-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>{t(lang, 'source') || 'Source'}:</span>
              <span className="text-gold-300 font-mono">{impliedOunce?.source || 'N/A'}</span>
            </div>
            {impliedOunce && (
              <div className="flex items-center justify-between">
                <span>{t(lang, 'lastUpdated') || 'Last Updated'}:</span>
                <span className="text-gray-300">{formatTimestamp(impliedOunce.timestamp)}</span>
              </div>
            )}
          </div>
        </div>

        {/* USD/EGP Exchange Rate Source */}
        <div className={`border-b border-gray-800 pb-4 ${isRTL ? 'text-right' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              {t(lang, 'exchangeRate') || 'USD/EGP Exchange Rate'}
            </h3>
            {fx && getStatusBadge(fx.stale || fx.error ? 'STALE' : 'OK')}
          </div>
          <div className="text-sm text-gray-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>{t(lang, 'source') || 'Source'}:</span>
              <span className="text-gold-300 font-mono">{fx?.source || 'N/A'}</span>
            </div>
            {fx && (
              <div className="flex items-center justify-between">
                <span>{t(lang, 'lastUpdated') || 'Last Updated'}:</span>
                <span className="text-gray-300">{formatTimestamp(fx.fetchedAt)}</span>
              </div>
            )}
            {fx?.error && (
              <div className="text-red-400 text-xs mt-1">
                {fx.error}
              </div>
            )}
          </div>
        </div>

        {/* Egypt Market Sources */}
        <div className={isRTL ? 'text-right' : ''}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              {t(lang, 'egyptMarket') || 'Egypt Market Sources'}
            </h3>
            {egyptMarket && (
              <span className="text-xs text-gray-400">
                {egyptMarket.activeSourceCount || 0} {t(lang, 'active') || 'active'}
              </span>
            )}
          </div>
          
          {egyptMarket?.sources && egyptMarket.sources.length > 0 ? (
            <div className="space-y-2 mt-3">
              {egyptMarket.sources.map((source, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm bg-gray-800 rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs">
                      {source.source}
                    </span>
                    {getStatusBadge(source.status)}
                  </div>
                  <span className="text-gray-500 text-xs">
                    {formatTimestamp(source.fetchedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 mt-2">
              {t(lang, 'noSources') || 'No sources available'}
            </div>
          )}

          {/* Sources Used Breakdown by Karat */}
          {egyptMarket?.sourcesUsed && Object.keys(egyptMarket.sourcesUsed).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">
                {t(lang, 'sourcesByKarat') || 'Sources by Karat'}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(egyptMarket.sourcesUsed).map(([karat, sources]) => (
                  <div key={karat} className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gold-300 font-semibold">{karat}K</div>
                    <div className="text-gray-400 mt-1">
                      {Array.isArray(sources) && sources.length > 0
                        ? sources.join(', ')
                        : 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

