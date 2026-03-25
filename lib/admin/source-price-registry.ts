/**
 * Admin diagnostics: canonical list of market countries and price sources
 * derived from ingestion + normalized read paths (queries-norm).
 */

import { SOURCE_WEIGHTS } from '@/lib/gold-ingestion-config';

export const ADMIN_MARKET_COUNTRIES = ['EG', 'AE', 'SA', 'US'] as const;
export type AdminMarketCountry = (typeof ADMIN_MARKET_COUNTRIES)[number];

export type SourceKind = 'regex_scraper' | 'cheerio_scraper' | 'spot_derived' | 'parity_derived' | 'aggregate_output' | 'legacy_adapter';

export interface AdminSourceRegistryEntry {
  country: AdminMarketCountry;
  sourceId: string;
  kind: SourceKind;
  /** Human-readable adapter / pipeline label */
  adapterLabel: string;
}

function aggregateEntries(country: AdminMarketCountry): AdminSourceRegistryEntry[] {
  return [
    {
      country,
      sourceId: 'aggregated',
      kind: 'aggregate_output',
      adapterLabel: 'engine_aggregated',
    },
    {
      country,
      sourceId: 'series_aggregate',
      kind: 'aggregate_output',
      adapterLabel: 'series_aggregate',
    },
  ];
}

/**
 * Single list of all logical sources shown on the admin diagnostics page.
 * Order: Egypt scrapers, Egypt legacy, Egypt aggregates, then AE / SA / US.
 */
export function getAdminSourceRegistry(): AdminSourceRegistryEntry[] {
  const egScrapers: AdminSourceRegistryEntry[] = Object.keys(SOURCE_WEIGHTS).map((sourceId) => ({
    country: 'EG',
    sourceId,
    kind: 'regex_scraper',
    adapterLabel: 'gold-sources-adapters-regex',
  }));

  return [
    ...egScrapers,
    {
      country: 'EG',
      sourceId: 'isagha',
      kind: 'legacy_adapter',
      adapterLabel: 'ingestion-adapters (debug/legacy)',
    },
    {
      country: 'EG',
      sourceId: 'goldbillion',
      kind: 'legacy_adapter',
      adapterLabel: 'ingestion-adapters (debug/legacy)',
    },
    ...aggregateEntries('EG'),
    {
      country: 'AE',
      sourceId: 'goldprice_org_ae',
      kind: 'cheerio_scraper',
      adapterLabel: 'gold-sources-adapters-multicountry',
    },
    {
      country: 'AE',
      sourceId: 'global_parity',
      kind: 'parity_derived',
      adapterLabel: 'global-parity + implied ounce',
    },
    ...aggregateEntries('AE'),
    {
      country: 'SA',
      sourceId: 'goldprice_org_sa',
      kind: 'cheerio_scraper',
      adapterLabel: 'gold-sources-adapters-multicountry',
    },
    {
      country: 'SA',
      sourceId: 'global_parity',
      kind: 'parity_derived',
      adapterLabel: 'global-parity + implied ounce',
    },
    ...aggregateEntries('SA'),
    {
      country: 'US',
      sourceId: 'goldapi_spot',
      kind: 'spot_derived',
      adapterLabel: 'gold_spot → per-gram karats',
    },
    ...aggregateEntries('US'),
  ];
}
