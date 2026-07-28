-- Durable per-person access matrices (survive EC2 redeploys).
-- Run once in Supabase SQL editor if the table does not exist.

create table if not exists public.user_access (
  email text primary key,
  access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_access enable row level security;

-- Service role / backend uses the service key (bypasses RLS). Optional read policy for debugging:
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'user_access' and policyname = 'service_all_user_access'
  ) then
    create policy service_all_user_access on public.user_access
      for all
      using (true)
      with check (true);
  end if;
exception when others then
  null;
end $$;

grant all on public.user_access to service_role;
grant select, insert, update, delete on public.user_access to authenticated;
