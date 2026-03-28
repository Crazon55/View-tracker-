-- ============================================
-- Fix: Disable RLS on Idea Engine tables
-- Supabase enables RLS by default, blocking all operations
-- Run this in Supabase SQL Editor
-- ============================================

-- Disable RLS on content_strategists
ALTER TABLE public.content_strategists DISABLE ROW LEVEL SECURITY;

-- Disable RLS on ideas
ALTER TABLE public.ideas DISABLE ROW LEVEL SECURITY;

-- Also make cs_owner_id optional (in case not already done)
ALTER TABLE public.ideas ALTER COLUMN cs_owner_id DROP NOT NULL;
