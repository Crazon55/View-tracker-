-- Add IndiaHappeningNow + TheChangingOrder to seeding monetisable pages (briefs).
-- Safe to re-run. Does NOT deactivate existing pages.

insert into public.seeding_monetisable_pages (page_id, page_name, active, notes, created_at, updated_at)
values
  ('page_indiahappeningnow', 'IndiaHappeningNow', true, 'Added for briefs', now(), now()),
  ('page_thechangingorder',  'TheChangingOrder',  true, 'Added for briefs', now(), now())
on conflict (page_id) do update set
  page_name  = excluded.page_name,
  active     = true,
  notes      = excluded.notes,
  updated_at = now();

-- If older rows exist under different page_id / spelling, activate by name too.
update public.seeding_monetisable_pages
set active = true, updated_at = now()
where lower(replace(page_name, ' ', '')) in (
  'indiahappeningnow',
  'thechangingorder'
);
