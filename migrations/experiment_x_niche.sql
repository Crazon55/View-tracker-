-- =====================================================================
-- Experiment X Niche Setup
--
-- Only indianfoundersco (IFC) is moving from Garfields to Experiment X.
-- indiafounderscore + indianfoundersdaily are brand new pages.
-- indiastartupstory and indianbusinesscom stay in their original teams.
--
-- Safe to re-run.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. Add the 2 brand new pages
-- ------------------------------------------------------------------
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('indiafounderscore',   'India Founders Core',   'https://www.instagram.com/indiafounderscore/',   false, 1),
  ('indianfoundersdaily', 'Indian Founders Daily',  'https://www.instagram.com/indianfoundersdaily/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- 2. Create FBS - Experiment X niche (skip if already exists)
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Experiment X', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Experiment X');

-- ------------------------------------------------------------------
-- 3. Assign IFC + 2 new pages to Experiment X
--    (IFC stays in Garfields too so Post Tracker still shows it)
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  'indianfoundersco',
  'indiafounderscore',
  'indianfoundersdaily'
]::text[]
WHERE name = 'FBS - Experiment X';

-- ------------------------------------------------------------------
-- 4. Verify
-- ------------------------------------------------------------------
SELECT name, cardinality(pages) AS page_count, pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'FBS - Experiment X')
ORDER BY name;
