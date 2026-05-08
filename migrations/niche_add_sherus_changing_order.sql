-- =====================================================================
-- The Sherus team — ONE-SHOT setup
-- Run this in Supabase SQL editor.
--
-- 1. Upserts 'thechangingorder' into `pages`
-- 2. Creates the 'FBS - Sherus' niche if it doesn't exist
-- 3. Sets its pages array to ['thechangingorder']
-- 4. Prints verification
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) Ensure the page exists in the `pages` table
-- ------------------------------------------------------------------
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('thechangingorder', 'The Changing Order', 'https://www.instagram.com/thechangingorder/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- 2) Ensure the niche exists
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Sherus', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Sherus');

-- ------------------------------------------------------------------
-- 3) Set the niche pages
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  'thechangingorder'
]::text[]
WHERE name = 'FBS - Sherus';

-- ------------------------------------------------------------------
-- 4) Verify
-- ------------------------------------------------------------------
SELECT name,
       cardinality(pages) AS page_count,
       pages
FROM tracker_niches
WHERE name = 'FBS - Sherus';
