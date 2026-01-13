-- Migration: Add user_agent column to push_subscriptions if missing
-- This fixes the error: "Could not find the 'user_agent' column of 'push_subscriptions' in the schema cache"
-- Run this in Supabase SQL Editor if you get the error

DO $$ 
BEGIN
  -- Add user_agent column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'push_subscriptions' 
    AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE public.push_subscriptions ADD COLUMN user_agent TEXT NULL;
    RAISE NOTICE 'Added user_agent column to push_subscriptions';
  ELSE
    RAISE NOTICE 'user_agent column already exists in push_subscriptions';
  END IF;

  -- Add content_encoding column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'push_subscriptions' 
    AND column_name = 'content_encoding'
  ) THEN
    ALTER TABLE public.push_subscriptions ADD COLUMN content_encoding TEXT DEFAULT 'aes128gcm';
    RAISE NOTICE 'Added content_encoding column to push_subscriptions';
  ELSE
    RAISE NOTICE 'content_encoding column already exists in push_subscriptions';
  END IF;
END $$;

