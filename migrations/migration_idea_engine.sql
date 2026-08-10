-- ============================================
-- Idea Engine Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Content Strategists
create table public.content_strategists (
  id uuid not null default gen_random_uuid(),
  name text not null,
  role text null,
  created_at timestamp with time zone null default now(),
  constraint content_strategists_pkey primary key (id),
  constraint content_strategists_name_key unique (name)
) TABLESPACE pg_default;


-- 2. Ideas (with auto-generated FS-XXX code)
create table public.ideas (
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

create index idx_ideas_cs_owner on public.ideas using btree (cs_owner_id) TABLESPACE pg_default;
create index idx_ideas_status on public.ideas using btree (status) TABLESPACE pg_default;


-- 2b. Add posted_at to posts (was missing — posts only had created_at)
alter table public.posts add column posted_at timestamp with time zone null;
-- Backfill existing posts: set posted_at = created_at so old data isn't orphaned
update public.posts set posted_at = created_at where posted_at is null;


-- 3. Add idea_id FK to reels (nullable — old reels won't have one)
alter table public.reels add column idea_id uuid null;
alter table public.reels add constraint reels_idea_id_fkey
  foreign key (idea_id) references ideas (id) on delete set null;
create index idx_reels_idea on public.reels using btree (idea_id) TABLESPACE pg_default;


-- 4. Add idea_id FK to posts (nullable — old posts won't have one)
alter table public.posts add column idea_id uuid null;
alter table public.posts add constraint posts_idea_id_fkey
  foreign key (idea_id) references ideas (id) on delete set null;
create index idx_posts_idea on public.posts using btree (idea_id) TABLESPACE pg_default;


-- 5. Function to auto-generate idea_code as FS-001, FS-002, etc.
create or replace function generate_idea_code()
returns trigger as $$
begin
  NEW.idea_code := 'FS-' || lpad(NEW.idea_number::text, 3, '0');
  return NEW;
end;
$$ language plpgsql;

create trigger trg_idea_code
  before insert on public.ideas
  for each row
  execute function generate_idea_code();
