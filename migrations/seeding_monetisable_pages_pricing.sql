-- Official Frontseat monetisable pages (from Current Page Pricing sheet).
-- Safe to re-run. Upserts by page_id; renames legacy seed rows where handles match.

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
  ('page_101xfounders',      '101x Founders',        true, '@101xfounders · excluded from Business bundle', now(), now()),
  ('page_bizzindia',         'Bizz India',           true, '@bizzindia · Business bundle', now(), now()),
  ('page_indiabusinesscom',  'India Business Com',   true, '@indiabusinesscom · Business bundle', now(), now()),
  ('page_indiafoundersco',   'India Founders Co',    true, '@indiafoundersco · Business bundle', now(), now()),
  ('page_indiafounderscore', 'India Founders Core',  true, '@indiafounderscore · Business bundle', now(), now()),
  ('page_foundersinindia',   'Founders in India',    true, '@foundersinindia · Business bundle', now(), now()),
  ('page_startupcoded',      'Startup Coded',        true, '@startupcoded · Business bundle', now(), now()),
  ('page_indiastartupstory', 'India Startup Story',  true, '@indiastartupstory · Business bundle', now(), now())
on conflict (page_id) do update set
  page_name  = excluded.page_name,
  active     = excluded.active,
  notes      = excluded.notes,
  updated_at = now();

-- Soft-deactivate legacy demo pages that are not on the pricing sheet.
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
  'page_indiastartupstory'
)
and page_name in (
  'Startup by Dog',
  'The Changing Order',
  'Biz India',
  'Indian Founders Co',
  'Startupcoded'
);
