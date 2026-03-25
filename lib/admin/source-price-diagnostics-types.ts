import type { AdminMarketCountry } from './source-price-registry';

export type DiagnosticsHealth = 'healthy' | 'stale' | 'failed' | 'missing_data';

export type StaleBasis = 'source_staleness' | 'snapshot_age' | 'none';

/** Serialized to the admin UI / API */
export interface AdminSourcePriceRow {
  country: AdminMarketCountry;
  sourceId: string;
  adapterLabel: string;
  kind: string;
  /** buy price per karat (gram), null = unknown */
  buyByKarat: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>;
  sellByKarat: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>;
  currency: string | null;
  trustedLatest: boolean | null;
  /** Latest row timestamp from DB (attempt), ISO */
  lastCheckedAt: string | null;
  /** Best success signal: max(last_ok from source_staleness, latest snapshot with prices), ISO */
  lastSuccessAt: string | null;
  /** Representative karat 24 — full detail in perKaratStale */
  stale: boolean;
  staleBasis: StaleBasis;
  staleAfterMs: number;
  /** Age from last success reference (for 24k summary), ms */
  freshnessAgeMs: number | null;
  staleReason: string | null;
  valid: boolean;
  errorMessage: string | null;
  notes: string[];
  /**
   * Egypt weighted pipeline only: would contribute to computeWeightedAverage
   * when reconstructed from latest stored wide snapshots (see footer note).
   */
  usedInWeightedAggregation: boolean | null;
  globalReference: string | null;
  storageCoverage: 'wide' | 'norm' | 'both' | 'none';
  perKaratStale: Partial<Record<'14' | '18' | '21' | '22' | '24', boolean>>;
  health: DiagnosticsHealth;
}

export interface AdminSourcePriceDiagnosticsPayload {
  generatedAt: string;
  staleAfterMs: number;
  rows: AdminSourcePriceRow[];
  meta: {
    goldSpotUsdPerOz: number | null;
    goldSpotFetchedAt: string | null;
    goldSpotStale: boolean | null;
    loadWarnings: string[];
  };
}
