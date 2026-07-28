-- Campaign report rationale on deals (run once in Supabase SQL editor).
-- Views + live_link already exist on public.seeding_deliverables — no change needed there.

alter table public.seeding_deals
  add column if not exists content_rationale text not null default '';
