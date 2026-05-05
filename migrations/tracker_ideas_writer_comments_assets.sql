-- Adds "writer comments" + uploaded assets to tracker ideas.
-- Run in Supabase SQL Editor.

alter table if exists public.tracker_ideas
  add column if not exists writer_comments text;

alter table if exists public.tracker_ideas
  add column if not exists assets jsonb not null default '[]'::jsonb;

