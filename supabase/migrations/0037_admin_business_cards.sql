-- Admin Business Cards Migration
-- Creates business cards table for admin users to create public personal profiles

-- Table: admin_business_cards
-- Stores public business card information for admin users
CREATE TABLE IF NOT EXISTS public.admin_business_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  is_public BOOLEAN DEFAULT true,
  
  -- Basic Information
  full_name TEXT NOT NULL,
  role_title TEXT,
  headline TEXT,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  company_name TEXT,
  
  -- Contact Information
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  location TEXT,
  website_url TEXT,
  
  -- Social Links
  linkedin_url TEXT,
  github_url TEXT,
  telegram_url TEXT,
  twitter_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  calendly_url TEXT,
  
  -- Platform/App Links (JSON)
  apps_json JSONB DEFAULT '[]'::jsonb,
  
  -- Skills/Tags (JSON array)
  skills_json JSONB DEFAULT '[]'::jsonb,
  
  -- Appearance
  theme_color TEXT DEFAULT '#000000',
  
  -- Visibility Controls
  show_email BOOLEAN DEFAULT true,
  show_phone BOOLEAN DEFAULT true,
  show_location BOOLEAN DEFAULT true,
  show_company BOOLEAN DEFAULT true,
  noindex BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_business_cards_slug ON public.admin_business_cards(slug);
CREATE INDEX IF NOT EXISTS idx_admin_business_cards_user_id ON public.admin_business_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_business_cards_is_public ON public.admin_business_cards(is_public);

-- RLS (Row Level Security)
ALTER TABLE public.admin_business_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- 1. Admins can view their own cards
CREATE POLICY "Admins can view own business cards" ON public.admin_business_cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = user_id 
      AND (
        -- Check user_profiles.is_admin
        EXISTS (
          SELECT 1 FROM public.user_profiles 
          WHERE user_profiles.id = user_id 
          AND user_profiles.is_admin = true
        )
        -- Or check admin_users table
        OR EXISTS (
          SELECT 1 FROM public.admin_users 
          WHERE admin_users.user_id = user_id
        )
      )
    )
  );

-- 2. Public cards can be viewed by anyone
CREATE POLICY "Public business cards are viewable by all" ON public.admin_business_cards
  FOR SELECT USING (is_public = true);

-- 3. Admins can insert their own cards
CREATE POLICY "Admins can insert own business cards" ON public.admin_business_cards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = user_id 
      AND (
        -- Check user_profiles.is_admin
        EXISTS (
          SELECT 1 FROM public.user_profiles 
          WHERE user_profiles.id = user_id 
          AND user_profiles.is_admin = true
        )
        -- Or check admin_users table
        OR EXISTS (
          SELECT 1 FROM public.admin_users 
          WHERE admin_users.user_id = user_id
        )
      )
    )
  );

-- 4. Admins can update their own cards
CREATE POLICY "Admins can update own business cards" ON public.admin_business_cards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = user_id 
      AND (
        -- Check user_profiles.is_admin
        EXISTS (
          SELECT 1 FROM public.user_profiles 
          WHERE user_profiles.id = user_id 
          AND user_profiles.is_admin = true
        )
        -- Or check admin_users table
        OR EXISTS (
          SELECT 1 FROM public.admin_users 
          WHERE admin_users.user_id = user_id
        )
      )
    )
  );

-- 5. Admins can delete their own cards
CREATE POLICY "Admins can delete own business cards" ON public.admin_business_cards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = user_id 
      AND (
        -- Check user_profiles.is_admin
        EXISTS (
          SELECT 1 FROM public.user_profiles 
          WHERE user_profiles.id = user_id 
          AND user_profiles.is_admin = true
        )
        -- Or check admin_users table
        OR EXISTS (
          SELECT 1 FROM public.admin_users 
          WHERE admin_users.user_id = user_id
        )
      )
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_business_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_admin_business_cards_updated_at
  BEFORE UPDATE ON public.admin_business_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_business_cards_updated_at();

-- Function to generate unique slug if not provided
CREATE OR REPLACE FUNCTION generate_unique_business_card_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  new_slug TEXT;
  counter INTEGER := 1;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    -- Generate slug from full_name
    base_slug := LOWER(REGEXP_REPLACE(NEW.full_name, '[^a-zA-Z0-9\s]', '', 'g'));
    base_slug := REGEXP_REPLACE(base_slug, '\s+', '-', 'g');
    base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');
    base_slug := TRIM(BOTH '-' FROM base_slug);
    
    IF base_slug = '' THEN
      base_slug := 'card';
    END IF;
    
    new_slug := base_slug;
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM public.admin_business_cards WHERE slug = new_slug AND id != NEW.id) LOOP
      new_slug := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    
    NEW.slug := new_slug;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to generate slug on insert
CREATE TRIGGER generate_business_card_slug
  BEFORE INSERT ON public.admin_business_cards
  FOR EACH ROW
  EXECUTE FUNCTION generate_unique_business_card_slug();

-- Comments
COMMENT ON TABLE public.admin_business_cards IS 'Public business cards for admin users';
COMMENT ON COLUMN public.admin_business_cards.user_id IS 'Reference to the admin user who owns this card';
COMMENT ON COLUMN public.admin_business_cards.slug IS 'Unique URL slug for public access';
COMMENT ON COLUMN public.admin_business_cards.is_public IS 'Whether the card is publicly visible';
COMMENT ON COLUMN public.admin_business_cards.apps_json IS 'JSON array of app/platform links with icons';
COMMENT ON COLUMN public.admin_business_cards.skills_json IS 'JSON array of skills/specialty tags';
COMMENT ON COLUMN public.admin_business_cards.noindex IS 'Whether to add noindex meta tag for SEO';
