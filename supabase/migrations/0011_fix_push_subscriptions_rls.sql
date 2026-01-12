-- Fix RLS policies for push_subscriptions to support upsert operations
-- Upsert requires both INSERT and UPDATE policies

DO $$ 
BEGIN
  -- Drop existing UPDATE policy if it exists
  DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON public.push_subscriptions;
  
  -- Create UPDATE policy for upsert operations
  CREATE POLICY "Users can update their own push subscriptions"
    ON public.push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

