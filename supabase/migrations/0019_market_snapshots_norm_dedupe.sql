-- Ensure market_snapshots_norm can be backfilled idempotently.
-- We store multiple karats per snapshot with the same raw_hash, so uniqueness must include karat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_snapshots_norm_country_karat_raw_hash
  ON public.market_snapshots_norm(country, karat, raw_hash)
  WHERE raw_hash IS NOT NULL;

