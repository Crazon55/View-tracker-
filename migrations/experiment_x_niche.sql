-- =====================================================================
-- Experiment X Niche Setup
--
-- IFC (indianfoundersco) → stays in Garfields + added to Experiment X
-- indianbusinesscom      → removed from Garfields, only in Experiment X
-- indiastartupstory      → removed from Goofies,   only in Experiment X
-- indiafounderscore      → new page, only in Experiment X
-- indianfoundersdaily    → new page, only in Experiment X
--
-- Safe to re-run.
-- =====================================================================

-- 1. Add 2 new pages
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('indiafounderscore',   'India Founders Core',   'https://www.instagram.com/indiafounderscore/',   false, 1),
  ('indianfoundersdaily', 'Indian Founders Daily',  'https://www.instagram.com/indianfoundersdaily/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- 2. Create FBS - Experiment X niche
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Experiment X', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Experiment X');

-- 3. All 5 pages go into Experiment X
UPDATE tracker_niches
SET pages = ARRAY[
  'indianfoundersco',
  'indianbusinesscom',
  'indiastartupstory',
  'indiafounderscore',
  'indianfoundersdaily'
]::text[]
WHERE name = 'FBS - Experiment X';

-- 4. Remove indianbusinesscom from Garfields (NOT indianfoundersco — IFC stays in both)
UPDATE tracker_niches
SET pages = array_remove(pages, 'indianbusinesscom')
WHERE name = 'FBS - Garfields';

-- 5. Remove indiastartupstory from Goofies
UPDATE tracker_niches
SET pages = array_remove(pages, 'indiastartupstory')
WHERE name = 'FBS - Goofies';

-- 6. Verify
SELECT name, cardinality(pages) AS page_count, pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'FBS - Experiment X')
ORDER BY name;
