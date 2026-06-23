-- =====================================================================
-- Add elitefoundrs + foundersindex to FBS - Garfields
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
-- =====================================================================

-- 1) Ensure both pages exist
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('elitefoundrs',  'Elite Founders',  'https://www.instagram.com/elitefoundrs/',  false, 1),
  ('foundersindex', 'Founders Index',  'https://www.instagram.com/foundersindex/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- 2) Remove from Goofies if they were on the legacy roster
UPDATE tracker_niches
SET pages = array_remove(array_remove(pages, 'elitefoundrs'), 'foundersindex')
WHERE name = 'FBS - Goofies';

-- 3) Append to Garfields (preserve existing handles)
UPDATE tracker_niches
SET pages = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(pages, '{}'::text[]) || ARRAY['elitefoundrs', 'foundersindex']::text[]
    )
    ORDER BY 1
  )
)
WHERE name = 'FBS - Garfields';

-- 4) Verify
SELECT handle, name FROM pages
WHERE lower(trim(handle)) IN ('elitefoundrs', 'foundersindex')
ORDER BY handle;

SELECT name, cardinality(pages) AS page_count, pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies')
ORDER BY name;
