-- Add company_logo_url field to admin_business_cards table
-- This migration adds support for company logo uploads in business cards
-- This migration is idempotent - safe to run multiple times

-- Add the company_logo_url field only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'admin_business_cards' 
        AND column_name = 'company_logo_url'
    ) THEN
        ALTER TABLE public.admin_business_cards 
        ADD COLUMN company_logo_url TEXT;
        
        -- Add comment for documentation
        COMMENT ON COLUMN public.admin_business_cards.company_logo_url IS 'URL of the company logo image uploaded to Supabase Storage';
        
        RAISE NOTICE 'company_logo_url column added successfully';
    ELSE
        RAISE NOTICE 'company_logo_url column already exists';
    END IF;
END $$;

-- Verify the column exists
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'admin_business_cards' 
  AND column_name = 'company_logo_url';
