-- Your Instagram Pages --
create table public.pages (
  id uuid not null default gen_random_uuid (),
  handle text not null,
  name text null,
  profile_url text null,
  profile_image_url text null,
  followers_count bigint null default 0,
  auto_scrape boolean not null default false,
  created_at timestamp with time zone null default now(),
  constraint pages_pkey primary key (id),
  constraint pages_handle_key unique (handle)
) TABLESPACE pg_default;


-- Posts: carousels & statics (always manual) --
create table public.posts (
  id uuid not null default gen_random_uuid (),
  page_id uuid not null,
  url text not null,
  expected_views bigint null default 0,
  actual_views bigint null default 0,
  created_at timestamp with time zone null default now(),
  constraint posts_pkey primary key (id),
  constraint posts_url_key unique (url),
  constraint posts_page_id_fkey foreign key (page_id) references pages (id) on delete cascade
) TABLESPACE pg_default;

create index idx_posts_page on public.posts using btree (page_id) TABLESPACE pg_default;


-- Reels: scraped from profiles or added manually --
create table public.reels (
  id uuid not null default gen_random_uuid (),
  page_id uuid not null,
  url text not null,
  views bigint null default 0,
  likes bigint null default 0,
  comments bigint null default 0,
  posted_at timestamp with time zone null,
  auto_scrape boolean not null default false,
  last_scraped_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint reels_pkey primary key (id),
  constraint reels_url_key unique (url),
  constraint reels_page_id_fkey foreign key (page_id) references pages (id) on delete cascade
) TABLESPACE pg_default;

create index idx_reels_page on public.reels using btree (page_id) TABLESPACE pg_default;
create index idx_reels_posted_at on public.reels using btree (posted_at desc) TABLESPACE pg_default;


-- Instagram Dashboard Views: manually entered monthly view counts per page --
create table public.dashboard_views (
  id uuid not null default gen_random_uuid (),
  page_id uuid not null,
  reel_views bigint not null default 0,
  post_views bigint not null default 0,
  month date not null,
  created_at timestamp with time zone null default now(),
  constraint dashboard_views_pkey primary key (id),
  constraint dashboard_views_page_month_key unique (page_id, month),
  constraint dashboard_views_page_id_fkey foreign key (page_id) references pages (id) on delete cascade
) TABLESPACE pg_default;

create index idx_dashboard_views_page on public.dashboard_views using btree (page_id, month desc) TABLESPACE pg_default;
