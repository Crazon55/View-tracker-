-- ============================================
-- Idea Engine Migration (SAFE - skips existing)
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Content Strategists (skip if exists)
create table if not exists public.content_strategists (
  id uuid not null default gen_random_uuid(),
  name text not null,
  role text null,
  created_at timestamp with time zone null default now(),
  constraint content_strategists_pkey primary key (id),
  constraint content_strategists_name_key unique (name)
) TABLESPACE pg_default;


-- 2. Ideas (skip if exists)
create table if not exists public.ideas (
  id uuid not null default gen_random_uuid(),
  idea_number serial not null,
  idea_code text not null,
  hook text not null,
  cs_owner_id uuid not null,
  format text not null default 'reel',
  source text not null default 'original',
  status text not null default 'active',
  notes text null,
  created_at timestamp with time zone null default now(),
  constraint ideas_pkey primary key (id),
  constraint ideas_idea_code_key unique (idea_code),
  constraint ideas_idea_number_key unique (idea_number),
  constraint ideas_cs_owner_id_fkey foreign key (cs_owner_id) references content_strategists (id) on delete cascade
) TABLESPACE pg_default;

create index if not exists idx_ideas_cs_owner on public.ideas using btree (cs_owner_id) TABLESPACE pg_default;
create index if not exists idx_ideas_status on public.ideas using btree (status) TABLESPACE pg_default;


-- 2b. Add posted_at to posts (skip if already exists)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'posts' and column_name = 'posted_at') then
    alter table public.posts add column posted_at timestamp with time zone null;
    update public.posts set posted_at = created_at where posted_at is null;
  end if;
end $$;


-- 3. Add idea_id to reels (skip if already exists)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'reels' and column_name = 'idea_id') then
    alter table public.reels add column idea_id uuid null;
    alter table public.reels add constraint reels_idea_id_fkey foreign key (idea_id) references ideas (id) on delete set null;
    create index idx_reels_idea on public.reels using btree (idea_id);
  end if;
end $$;


-- 4. Add idea_id to posts (skip if already exists)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'posts' and column_name = 'idea_id') then
    alter table public.posts add column idea_id uuid null;
    alter table public.posts add constraint posts_idea_id_fkey foreign key (idea_id) references ideas (id) on delete set null;
    create index idx_posts_idea on public.posts using btree (idea_id);
  end if;
end $$;


-- 5. Function to auto-generate idea_code as FS-001, FS-002, etc.
create or replace function generate_idea_code()
returns trigger as $$
begin
  NEW.idea_code := 'FS-' || lpad(NEW.idea_number::text, 3, '0');
  return NEW;
end;
$$ language plpgsql;

-- Drop trigger first if it exists, then recreate
drop trigger if exists trg_idea_code on public.ideas;
create trigger trg_idea_code
  before insert on public.ideas
  for each row
  execute function generate_idea_code();
