-- Migration: User Calculator Preferences
-- Stores user's last used calculator amount and fees percentage
-- Idempotent SQL script for Supabase

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_calculator_prefs'
  ) THEN
    CREATE TABLE public.user_calculator_prefs (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      last_amount NUMERIC NULL,
      last_fees_pct NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_user_calculator_prefs_user_id ON public.user_calculator_prefs(user_id);

    ALTER TABLE public.user_calculator_prefs ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own calculator prefs" ON public.user_calculator_prefs;
    CREATE POLICY "Users can view own calculator prefs"
      ON public.user_calculator_prefs FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own calculator prefs" ON public.user_calculator_prefs;
    CREATE POLICY "Users can insert own calculator prefs"
      ON public.user_calculator_prefs FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own calculator prefs" ON public.user_calculator_prefs;
    CREATE POLICY "Users can update own calculator prefs"
      ON public.user_calculator_prefs FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can delete own calculator prefs" ON public.user_calculator_prefs;
    CREATE POLICY "Users can delete own calculator prefs"
      ON public.user_calculator_prefs FOR DELETE
      USING (auth.uid() = user_id);

    -- Trigger for updated_at
    CREATE TRIGGER trigger_user_calculator_prefs_updated_at
      BEFORE UPDATE ON public.user_calculator_prefs
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

