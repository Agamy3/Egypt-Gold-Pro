-- Add company_logo_url field to admin_business_cards table
-- This migration adds support for company logo uploads in business cards

-- Add the company_logo_url field
ALTER TABLE public.admin_business_cards 
ADD COLUMN company_logo_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.admin_business_cards.company_logo_url IS 'URL of the company logo image uploaded to Supabase Storage';

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'admin_business_cards' 
  AND column_name = 'company_logo_url';
