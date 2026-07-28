-- Durable per-person access matrices (survive EC2 redeploys).
-- Run once in Supabase → SQL Editor → Run.
-- Backend uses the service_role key, which bypasses RLS.

create table if not exists public.user_access (
  email text primary key,
  access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_access enable row level security;

-- No policies for anon/authenticated on purpose.
-- Only the backend service_role key should read/write this table (bypasses RLS).

grant all on table public.user_access to service_role;
grant all on table public.user_access to postgres;

-- Sanity check (should return 0 rows until someone hits Save in Users & Roles):
-- select * from public.user_access;
