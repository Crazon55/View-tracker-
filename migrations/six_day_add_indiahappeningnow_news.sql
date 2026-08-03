-- =====================================================================
-- India Happening Now — News playbook (6-Day Tracker + pages roster)
-- Run in Supabase SQL editor. Safe to re-run.
--
-- 1. Upserts indiahappeningnow into `pages`
-- 2. Optional niche label for News playbook (UI also uses hardcoded handles)
-- 3. Verify
-- =====================================================================

INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  (
    'indiahappeningnow',
    'India Happening Now',
    'https://www.instagram.com/indiahappeningnow/',
    false,
    1
  )
ON CONFLICT (handle) DO UPDATE
SET name = EXCLUDED.name,
    profile_url = EXCLUDED.profile_url;

-- Optional tracker niche row (frontend News playbook uses hardcoded handles too)
INSERT INTO tracker_niches (name, pages)
SELECT 'News playbook', ARRAY['thechangingorder', 'indiahappeningnow']::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'News playbook');

UPDATE tracker_niches
SET pages = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(pages, '{}'::text[]) || ARRAY['thechangingorder', 'indiahappeningnow']::text[]
    )
    ORDER BY 1
  )
)
WHERE name = 'News playbook';

SELECT handle, name, stage FROM pages
WHERE lower(trim(handle)) IN ('indiahappeningnow', 'thechangingorder')
ORDER BY handle;

SELECT name, pages FROM tracker_niches WHERE name = 'News playbook';
