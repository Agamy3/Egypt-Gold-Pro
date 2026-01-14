-- Migration: Create price_series table for normalized time series data
-- This table stores aggregated median prices for forecasting

DO $$
BEGIN
  -- Create price_series table if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'price_series'
  ) THEN
    CREATE TABLE public.price_series (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NOT NULL CHECK (country IN ('EG','AE','SA','US')),
      karat INT NOT NULL CHECK (karat IN (14,18,21,24)),
      price NUMERIC NOT NULL CHECK (price > 0),
      currency TEXT NOT NULL CHECK (currency IN ('EGP','USD','AED','SAR')),
      source TEXT NOT NULL DEFAULT 'supabase_median',
      ts TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(country, karat, ts)
    );

    -- Create indexes for efficient queries
    CREATE INDEX idx_price_series_country_karat_ts ON public.price_series(country, karat, ts DESC);
    CREATE INDEX idx_price_series_ts ON public.price_series(ts DESC);
    CREATE INDEX idx_price_series_country_ts ON public.price_series(country, ts DESC);

    -- Enable RLS
    ALTER TABLE public.price_series ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Public read access (SELECT)
    CREATE POLICY "Public can read price_series"
      ON public.price_series FOR SELECT
      USING (true);

    -- RLS Policy: Service role only for INSERT/UPDATE/DELETE
    -- Note: Service role bypasses RLS, so we don't need explicit policies for write operations
    -- But we create a restrictive policy to be safe
    CREATE POLICY "Service role only for writes"
      ON public.price_series FOR INSERT
      WITH CHECK (false); -- This will be bypassed by service role

    CREATE POLICY "Service role only for updates"
      ON public.price_series FOR UPDATE
      USING (false)
      WITH CHECK (false); -- This will be bypassed by service role

    CREATE POLICY "Service role only for deletes"
      ON public.price_series FOR DELETE
      USING (false); -- This will be bypassed by service role

    -- Add comment
    COMMENT ON TABLE public.price_series IS 'Normalized time series of median gold prices per country/karat for forecasting';
    COMMENT ON COLUMN public.price_series.ts IS 'Timestamp rounded to 5-minute intervals';
    COMMENT ON COLUMN public.price_series.source IS 'Source identifier, default: supabase_median';
  END IF;
END $$;

