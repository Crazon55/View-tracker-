-- One-time backfill: copy legacy `link` into `comp_link` when comp_link is empty.
-- Safe to re-run: only updates rows where comp_link IS NULL and link has text.
-- Run in Supabase SQL Editor after deploy if historical URLs only exist in `link`.

UPDATE tracker_ideas
SET comp_link = link
WHERE comp_link IS NULL
  AND link IS NOT NULL
  AND TRIM(link) <> '';
