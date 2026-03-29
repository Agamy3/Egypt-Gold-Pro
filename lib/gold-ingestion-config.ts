/**
 * Gold Ingestion Configuration
 * 
 * Defines sources, weights, validation bounds, and staleness thresholds
 */

export const ABS_MIN: Record<number, number> = {
  24: 4000,
  21: 3500,
  18: 3000,
  14: 2000,
};

export const ABS_MAX: Record<number, number> = {
  24: 15000,
  21: 13000,
  18: 11000,
  14: 8000,
};

export const SOURCE_WEIGHTS: Record<string, number> = {
  banklive: 1.0,
  gold_era: 0.9,
  dokangold: 0.8,
  goldrate24: 0.5,
  goldbullioneg: 0.7,
};

export const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/** Egypt local: max age for treating persisted snapshots as “current” on homepage / health views. */
export const MARKET_HEALTH_FRESHNESS_MS =
  Math.max(1, Number(process.env.MARKET_HEALTH_FRESHNESS_HOURS ?? 6)) * 60 * 60 * 1000;

/** Sources that participate in Egypt weighted aggregation (same keys as SOURCE_WEIGHTS). */
export const EG_WEB_SOURCES = Object.keys(SOURCE_WEIGHTS);

/**
 * Minimum number of Egypt sources that must persist in the same ingestion run before
 * aggregated rows are considered non-degraded. Default 2; clamp 1..5.
 */
export function getEgyptAggregationMinSources(): number {
  const fromEnv = Number(process.env.EG_AGGREGATION_MIN_SOURCES);
  const base = Number.isFinite(fromEnv) ? Math.floor(fromEnv) : 2;
  return Math.min(EG_WEB_SOURCES.length, Math.max(1, base));
}

export const KARATS = [24, 22, 21, 18, 14] as const;
export type Karat = typeof KARATS[number];

export const SOURCE_URLS: Record<string, string> = {
  banklive: 'https://banklive.net/ar/gold-price-today-in-egypt',
  gold_era: 'https://egypt.gold-era.com/ar/%D8%B3%D8%B9%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8/',
  dokangold: 'https://dokangold.com/ar/eg/gold-14k-price',
  goldrate24: 'https://www.goldrate24.com/ar/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8/%D8%A7%D9%84%D8%B4%D8%B1%D9%82-%D8%A7%D9%84%D8%A3%D9%88%D8%B7/%D9%85%D8%B5%D8%B1/',
  goldbullioneg: 'https://goldbullioneg.com/%D8%A3%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8/',
};

export const MIN_HTML_SIZE = 5000;

export const JS_PLACEHOLDER_PATTERNS = [
  /enable\s+javascript/i,
  /please\s+enable\s+javascript/i,
  /javascript\s+required/i,
  /loading\.\.\./i,
  /<title>loading<\/title>/i,
];

