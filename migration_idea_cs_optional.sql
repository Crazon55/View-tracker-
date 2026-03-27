-- Make cs_owner_id optional on ideas table
-- Run this in Supabase SQL Editor
ALTER TABLE public.ideas ALTER COLUMN cs_owner_id DROP NOT NULL;
