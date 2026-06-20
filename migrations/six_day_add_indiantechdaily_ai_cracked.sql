-- =====================================================================
-- Tech niche pages for 6-Day Tracker — ONE-SHOT setup
-- Run this in Supabase SQL editor.
--
-- 1. Upserts indiantechdaily + ai.cracked into `pages`
-- 2. Ensures the Tech niche exists and lists both handles
-- 3. Adds both handles to FBS - TECH Playbook (keeps 101xtechnology)
-- 4. Prints verification
--
-- 6-Day Tracker UI: from Jun 2026 cycle 3, then every month after.
-- Safe to re-run.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) Ensure both pages exist
-- ------------------------------------------------------------------
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('indiantechdaily', 'India Tech Daily', 'https://www.instagram.com/indiantechdaily/', false, 1),
  ('ai.cracked',      'AI Cracked',       'https://www.instagram.com/ai.cracked/',      false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- 2) Tech niche (6-day tracker filter pill)
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'Tech', ARRAY['indiantechdaily', 'ai.cracked']::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'Tech');

UPDATE tracker_niches
SET pages = ARRAY['indiantechdaily', 'ai.cracked']::text[]
WHERE name = 'Tech';

-- ------------------------------------------------------------------
-- 3) TECH Playbook niche — merge handles without dropping existing
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - TECH Playbook', ARRAY['101xtechnology', 'indiantechdaily', 'ai.cracked']::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - TECH Playbook');

UPDATE tracker_niches
SET pages = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(pages, '{}'::text[]) || ARRAY['101xtechnology', 'indiantechdaily', 'ai.cracked']::text[]
    )
    ORDER BY 1
  )
)
WHERE name = 'FBS - TECH Playbook';

-- ------------------------------------------------------------------
-- 4) Verify
-- ------------------------------------------------------------------
SELECT handle, name FROM pages
WHERE lower(trim(handle)) IN ('indiantechdaily', 'ai.cracked')
ORDER BY handle;

SELECT name, cardinality(pages) AS page_count, pages
FROM tracker_niches
WHERE name IN ('Tech', 'FBS - TECH Playbook')
ORDER BY name;
