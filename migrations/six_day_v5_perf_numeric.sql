-- Replace the text perf-tag columns with numeric perf values (decimals allowed).
ALTER TABLE six_day_entries DROP COLUMN IF EXISTS reel_perf_tag;
ALTER TABLE six_day_entries DROP COLUMN IF EXISTS post_perf_tag;

ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS reel_perf NUMERIC;
ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS post_perf NUMERIC;
