-- Ensure market_snapshots_norm can be backfilled idempotently.
-- We store multiple karats per snapshot with the same raw_hash, so uniqueness must include karat.
--
-- If duplicates already exist, dedupe first (keep newest created_at per (country, karat, raw_hash)).
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY country, karat, raw_hash
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.market_snapshots_norm
  WHERE raw_hash IS NOT NULL
)
DELETE FROM public.market_snapshots_norm m
USING ranked r
WHERE m.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_market_snapshots_norm_country_karat_raw_hash
  ON public.market_snapshots_norm(country, karat, raw_hash)
  WHERE raw_hash IS NOT NULL;

