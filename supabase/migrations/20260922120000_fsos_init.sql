-- FSOS (Frontseat OS) — initial schema for the dedicated FSOS Supabase project.
--
-- Access model: RLS is enabled on every table with NO policies for anon/authenticated,
-- so the browser key cannot read or write anything directly. All access goes through
-- the FastAPI backend using the service-role key, which enforces FSOS roles/areas.
--
-- Calendar dates are IST dates (`date`); instants are `timestamptz`.
-- `legacy_*` columns hold ids from the old snoboard project so the copy script is re-runnable.

create extension if not exists pgcrypto;

create or replace function fsos_touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────────── Organisation ─────────────────────────────

create table people (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  email         text unique,
  name          text not null,
  initials      text,
  color         text not null default '#57534E',
  roles         text[] not null default '{}',   -- FSOS roles; empty = pending access
  streams       text[] not null default '{}',   -- 'BO' | 'HPN'
  skills        text[] not null default '{}',
  active        boolean not null default true,
  legacy_email  text unique,                    -- snoboard user_roles.email
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table ips (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  handle          text,                          -- Instagram handle, no '@'
  hex             text not null default '#57534E',
  active          boolean not null default true,
  tracker_group   text not null default 'none',  -- 6-Day filter group
  stage           smallint not null default 1 check (stage between 1 and 3),
  floors          jsonb not null default '{"posts":0,"reels":0}',
  ranges          jsonb not null default '{}',
  menu            text[] not null default '{}',
  bo_target       jsonb,                         -- null = BO quota not configured
  perf_target     jsonb not null default '{"reel":null,"post":null,"note":""}',
  spacing_minutes integer,
  legacy_page_id  text unique,                   -- snoboard pages.id
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  stream     text not null check (stream in ('BO', 'HPN')),
  created_at timestamptz not null default now(),
  unique (name, stream)
);

-- Singleton row: thresholds, approvers, cycle anchor, 6-day assignee, etc.
create table app_settings (
  id         boolean primary key default true check (id),
  settings   jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (true);

-- ───────────────────────────── Ideas → versions ─────────────────────────────

create table batches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  stream      text not null default 'BO' check (stream in ('BO', 'HPN')),
  deadline    date,
  reviewer_id uuid references people (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create sequence idea_number_seq;

create table ideas (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,            -- e.g. BO-042
  stream              text not null check (stream in ('BO', 'HPN')),
  title               text not null,
  topic               text,
  format              text not null check (format in ('Reel', 'Carousel', 'Static')),
  category            text,
  creator_id          uuid references people (id),
  sources             jsonb not null default '[]',    -- [{url,label,start,end}]
  brief               jsonb not null default '{}',    -- format-specific brief
  destinations        uuid[] not null default '{}',   -- ip ids
  approval_state      text not null default 'pending' check (approval_state in ('pending', 'approved', 'not_required')),
  approved_by         uuid references people (id),
  approved_at         timestamptz,
  production_owner_id uuid references people (id),
  previous_owners     jsonb not null default '[]',    -- [{ownerId, until}]
  reviewer_id         uuid references people (id),
  batch_id            uuid references batches (id) on delete set null,
  deadline            date,
  bypass_used         jsonb,
  dropped             jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ideas_stream_idx on ideas (stream);
create index ideas_batch_idx on ideas (batch_id);
create index ideas_owner_idx on ideas (production_owner_id);

-- One version per idea per destination IP.
create table versions (
  id             uuid primary key default gen_random_uuid(),
  idea_id        uuid not null references ideas (id) on delete cascade,
  ip_id          uuid not null references ips (id),
  hook_override  text not null default '',
  sub_hook       text not null default '',
  body_text      text not null default '',
  caption        text not null default '',
  notes_override text not null default '',
  asset_links    jsonb not null default '[]',   -- [{id,type,url,label}]
  review_status  text not null default 'not_started'
                 check (review_status in ('not_started', 'in_production', 'awaiting_review', 'changes_requested', 'ready')),
  revisions      jsonb not null default '[]',   -- [{id,at,by,note}]
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (idea_id, ip_id)
);
create index versions_ip_idx on versions (ip_id);
create index versions_status_idx on versions (review_status);

-- ───────────────────────────── Calendar → publication → views ─────────────────────────────

create table placements (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references versions (id) on delete cascade,
  ip_id            uuid not null references ips (id),
  date             date not null,
  time             time,
  sort_order       integer not null default 1,
  state            text not null default 'pending' check (state in ('pending', 'confirmed', 'cancelled')),
  history          jsonb not null default '[]',  -- [{at,by,action}]
  exception_reason text,
  exception_by     uuid references people (id),
  exception_at     timestamptz,
  reported_pending boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index placements_date_idx on placements (date);
create index placements_version_idx on placements (version_id);
-- A version can have at most one live (non-cancelled) placement.
create unique index placements_one_active_per_version on placements (version_id) where state <> 'cancelled';

create table publications (
  id           uuid primary key default gen_random_uuid(),
  url          text,
  published_at timestamptz not null,
  is_collab    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index publications_published_idx on publications (published_at);

-- A publication covers one version, or several for a collaboration post.
create table publication_versions (
  publication_id uuid not null references publications (id) on delete cascade,
  version_id     uuid not null references versions (id) on delete cascade,
  ip_id          uuid not null references ips (id),
  placement_id   uuid references placements (id) on delete set null,
  primary key (publication_id, version_id)
);

-- 24h view capture. views NULL = not captured (missing ≠ zero).
create table snapshots (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references publications (id) on delete cascade,
  views          bigint,
  measured_at    timestamptz,
  age_hours      integer,
  recorded_by    uuid references people (id),
  due_at         timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ───────────────────────────── Collaboration ─────────────────────────────

create table comments (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas (id) on delete cascade,
  version_id uuid references versions (id) on delete cascade,
  parent_id  uuid references comments (id) on delete cascade,  -- set for replies
  anchor     jsonb not null default '{"type":"general"}',
  body       text not null,
  author_id  uuid references people (id),
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_idea_idx on comments (idea_id);

create table activity (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid references ideas (id) on delete cascade,
  type       text not null,
  text       text not null,
  actor_id   uuid references people (id),
  created_at timestamptz not null default now()
);
create index activity_idea_idx on activity (idea_id, created_at desc);

-- person_id NULL = team-wide notification.
create table notifications (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid references people (id) on delete cascade,
  type           text not null,
  text           text not null,
  idea_id        uuid references ideas (id) on delete cascade,
  publication_id uuid references publications (id) on delete cascade,
  ticket_id      uuid,
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index notifications_person_idx on notifications (person_id, read, created_at desc);

-- ───────────────────────────── 6-Day tracker & growth ─────────────────────────────

create table six_day_entries (
  id         uuid primary key default gen_random_uuid(),
  month      date not null check (extract(day from month) = 1),  -- first of month
  cycle      smallint not null check (cycle between 1 and 5),
  ip_id      uuid not null references ips (id) on delete cascade,
  views      bigint not null default 0,
  reel_pct   smallint check (reel_pct between 0 and 100),
  post_pct   smallint check (post_pct between 0 and 100),
  reel_perf  numeric,
  post_perf  numeric,
  filled_by  uuid references people (id),
  updated_at timestamptz not null default now(),
  unique (month, cycle, ip_id)
);

create table six_day_top_content (
  id           uuid primary key default gen_random_uuid(),
  month        date not null check (extract(day from month) = 1),
  cycle        smallint not null check (cycle between 1 and 5),
  ip_id        uuid not null references ips (id) on delete cascade,
  link         text not null,
  views        bigint not null default 0,
  content_type text not null default 'reel' check (content_type in ('reel', 'post')),
  created_at   timestamptz not null default now()
);
create index six_day_top_content_month_idx on six_day_top_content (month, cycle);

create table six_day_actuals (
  month        date not null check (extract(day from month) = 1),
  ip_id        uuid not null references ips (id) on delete cascade,
  actual_views bigint not null,
  filled_by    uuid references people (id),
  updated_at   timestamptz not null default now(),
  primary key (month, ip_id)
);

create table growth_followers (
  month            date not null check (extract(day from month) = 1),
  ip_id            uuid not null references ips (id) on delete cascade,
  followers_gained integer not null default 0,
  primary key (month, ip_id)
);

-- ───────────────────────────── Tickets ─────────────────────────────

create table tickets (
  id            uuid primary key default gen_random_uuid(),
  ticket_number integer generated by default as identity (start with 101) unique,
  title         text not null,
  description   text not null,
  urgency       text not null default 'normal' check (urgency in ('low', 'normal', 'urgent')),
  status        text not null default 'not_started' check (status in ('not_started', 'in_progress', 'resolved')),
  tags          text[] not null default '{}',
  reporter_id   uuid references people (id),
  assignee_id   uuid references people (id),
  attachments   jsonb not null default '[]',   -- [{secure_url, public_id, resource_type, ...}] (Cloudinary)
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tickets_status_idx on tickets (status);
create index tickets_assignee_idx on tickets (assignee_id) where status <> 'resolved';

alter table notifications
  add constraint notifications_ticket_fk foreign key (ticket_id) references tickets (id) on delete cascade;

-- ───────────────────────────── News feed ─────────────────────────────

-- Same columns as snoboard's table so supabase/functions/fetch-news deploys unchanged.
create table news_articles (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  summary        text,
  body           text,
  url            text not null unique,
  source         text,
  keywords       text[] not null default '{}',
  published_date timestamptz,
  created_at     timestamptz not null default now()
);
create index news_articles_created_idx on news_articles (created_at desc);

create table news_feedback (
  article_url   text primary key,
  vote          text not null check (vote in ('yes', 'no')),
  article_title text,
  article_type  text,
  voted_by      uuid references people (id),
  updated_at    timestamptz not null default now()
);

-- Learned auto-block categories (e.g. 'routine-filing').
create table news_rules (
  category   text primary key,
  created_at timestamptz not null default now()
);

create table news_saved (
  article_url  text primary key,
  article_data jsonb not null,
  saved_by     uuid references people (id),
  created_at   timestamptz not null default now()
);

-- ───────────────────────────── Users & Roles ─────────────────────────────

-- Role-level overrides of the shipped defaults (domain/access.js). Founder/Admin is never stored.
create table access_role_overrides (
  role       text primary key check (role <> 'Founder/Admin'),
  matrix     jsonb not null,   -- {area_key: 'none'|'view'|'edit'}
  updated_at timestamptz not null default now()
);

-- Per-person differences from their roles' defaults.
create table access_person_overrides (
  person_id  uuid primary key references people (id) on delete cascade,
  matrix     jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── updated_at triggers ─────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'people', 'ips', 'app_settings', 'batches', 'ideas', 'versions', 'placements', 'snapshots',
    'six_day_entries', 'six_day_actuals', 'tickets', 'news_feedback', 'access_role_overrides', 'access_person_overrides'
  ] loop
    execute format('create trigger %I_touch before update on %I for each row execute function fsos_touch_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────────── Row-level security: deny by default ─────────────────────────────

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t.tablename);
  end loop;
end $$;
