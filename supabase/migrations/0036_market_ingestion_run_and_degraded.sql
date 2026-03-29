-- Ingestion run identity + degraded aggregation metadata (EG market snapshots)
-- Enables same-run validation between source rows and aggregated rows.

ALTER TABLE public.market_snapshots_norm
  ADD COLUMN IF NOT EXISTS ingestion_run_id UUID NULL,
  ADD COLUMN IF NOT EXISTS is_degraded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_write_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS fresh_source_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS degraded_reason TEXT NULL;

ALTER TABLE public.market_snapshots
  ADD COLUMN IF NOT EXISTS ingestion_run_id UUID NULL,
  ADD COLUMN IF NOT EXISTS is_degraded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_write_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS fresh_source_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS degraded_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_eg_run
  ON public.market_snapshots_norm (country, ingestion_run_id, created_at DESC)
  WHERE country = 'EG' AND ingestion_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_eg_agg_created
  ON public.market_snapshots_norm (country, source, created_at DESC)
  WHERE country = 'EG' AND source = 'aggregated';

CREATE INDEX IF NOT EXISTS idx_market_snapshots_eg_run
  ON public.market_snapshots (ingestion_run_id, "createdAt" DESC)
  WHERE ingestion_run_id IS NOT NULL;

