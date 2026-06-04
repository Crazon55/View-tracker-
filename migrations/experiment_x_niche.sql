-- =====================================================================
-- Experiment X Niche Setup
--
-- 1. Ensure all 5 Experiment X page handles exist in the pages table
-- 2. Create FBS - Experiment X niche
-- 3. Remove the 5 handles from Garfields and Goofies
-- 4. Assign them to Experiment X
--
-- Safe to re-run.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. Ensure new pages exist
-- ------------------------------------------------------------------
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('indiafounderscore',   'India Founders Core',   'https://www.instagram.com/indiafounderscore/',   false, 1),
  ('indianfoundersdaily', 'Indian Founders Daily',  'https://www.instagram.com/indianfoundersdaily/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- 2. Create Experiment X niche (skip if already exists)
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Experiment X', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Experiment X');

-- ------------------------------------------------------------------
-- 3. Assign the 5 pages to Experiment X
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  'indianfoundersco',
  'indianbusinesscom',
  'indiastartupstory',
  'indiafounderscore',
  'indianfoundersdaily'
]::text[]
WHERE name = 'FBS - Experiment X';

-- ------------------------------------------------------------------
-- 4. Remove those handles from Garfields
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = array_remove(array_remove(pages, 'indianfoundersco'), 'indianbusinesscom')
WHERE name = 'FBS - Garfields';

-- ------------------------------------------------------------------
-- 5. Remove indiastartupstory from Goofies
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = array_remove(pages, 'indiastartupstory')
WHERE name = 'FBS - Goofies';

-- ------------------------------------------------------------------
-- 6. Verify
-- ------------------------------------------------------------------
SELECT name, cardinality(pages) AS page_count, pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'FBS - Experiment X')
ORDER BY name;
