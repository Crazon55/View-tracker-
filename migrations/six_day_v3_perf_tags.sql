-- Per-IP-per-cycle performance tags (reel vs post)
ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS reel_perf_tag TEXT;
ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS post_perf_tag TEXT;
