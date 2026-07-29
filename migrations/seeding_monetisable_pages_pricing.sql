-- Official Frontseat monetisable pages (Current Page Pricing sheet + additions).
-- Safe to re-run. Upserts these pages and deactivates everything else.

create table if not exists public.seeding_monetisable_pages (
    page_id       text primary key,
    page_name     text not null,
    fsos_page_id  uuid,
    active        boolean not null default true,
    notes         text not null default '',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

insert into public.seeding_monetisable_pages (page_id, page_name, active, notes, created_at, updated_at)
values
  ('page_101xfounders',      '101xFounders',       true, 'Excluded from Business bundle', now(), now()),
  ('page_bizzindia',         'BizzIndia',          true, 'Business bundle', now(), now()),
  ('page_indiabusinesscom',  'IndiaBusinessCom',   true, 'Business bundle', now(), now()),
  ('page_indiafoundersco',   'IndiaFoundersCo',    true, 'Business bundle', now(), now()),
  ('page_indiafounderscore', 'IndiaFoundersCore',  true, 'Business bundle', now(), now()),
  ('page_foundersinindia',   'FoundersInIndia',    true, 'Business bundle', now(), now()),
  ('page_startupcoded',      'StartupCoded',       true, 'Business bundle', now(), now()),
  ('page_indiastartupstory', 'IndiaStartupStory',  true, 'Business bundle', now(), now()),
  ('page_indiahappeningnow', 'IndiaHappeningNow',  true, 'Added for briefs', now(), now()),
  ('page_thechangingorder',  'TheChangingOrder',   true, 'Added for briefs', now(), now())
on conflict (page_id) do update set
  page_name  = excluded.page_name,
  active     = true,
  notes      = excluded.notes,
  updated_at = now();

-- Only these stay active — everything else is off.
update public.seeding_monetisable_pages
set active = false, updated_at = now()
where page_id not in (
  'page_101xfounders',
  'page_bizzindia',
  'page_indiabusinesscom',
  'page_indiafoundersco',
  'page_indiafounderscore',
  'page_foundersinindia',
  'page_startupcoded',
  'page_indiastartupstory',
  'page_indiahappeningnow',
  'page_thechangingorder'
);
