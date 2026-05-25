-- =====================================================================
-- FBS niche roster update — Week 4 May 2026
-- Run this in Supabase SQL editor.
--
-- Garfields: swap indianbusinesscom → indiabusinesscom, add therealfoundr.
-- Goofies + Sherus unchanged from Week 3.
--
-- Safe to re-run (idempotent).
-- Does NOT delete rows from `pages`, `six_day_entries`, or any other table.
-- =====================================================================

-- Ensure new handle exists in `pages`
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  ('indiabusinesscom', 'India Business Com', 'https://www.instagram.com/indiabusinesscom/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- Garfields → 6 pages (Week 4 roster)
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  'bizzindia',
  'indianfoundersco',
  'startupbydog',
  'indiabusinesscom',
  'entrepreneursindia.co',
  'therealfoundr'
]::text[]
WHERE name = 'FBS - Garfields';

-- ------------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------------
SELECT name,
       cardinality(pages) AS page_count,
       pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'FBS - Sherus')
ORDER BY name;
