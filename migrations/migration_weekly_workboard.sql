-- Shared weekly workboard (Bandwidth tracker & ops)
-- Run this in Supabase SQL editor.

create table if not exists public.weekly_workboard (
  week_start date primary key,
  assignments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Helpful index if we ever query by updated_at
create index if not exists weekly_workboard_updated_at_idx
  on public.weekly_workboard (updated_at desc);

-- Enable RLS (optional). If you have a service-role key on the backend, it can bypass RLS.
-- If you enable RLS, you must add policies. Leaving them commented for now.
-- alter table public.weekly_workboard enable row level security;

