-- Fix RLS policies for public business card access
-- This migration adds a proper public access policy that doesn't require user_profiles access

-- Drop the existing problematic public policy
DROP POLICY IF EXISTS "Public business cards are viewable by all" ON public.admin_business_cards;

-- Create a new simple public policy that only checks is_public flag
CREATE POLICY "Public business cards are viewable by all" ON public.admin_business_cards
  FOR SELECT USING (is_public = true);

-- Ensure the policy is applied correctly
ALTER TABLE public.admin_business_cards ENABLE ROW LEVEL SECURITY;

-- Add a comment explaining the policy
COMMENT ON POLICY "Public business cards are viewable by all" ON public.admin_business_cards IS 'Allows anyone to view business cards marked as public without requiring user authentication';
