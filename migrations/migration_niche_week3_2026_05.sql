-- =====================================================================
-- FBS niche roster update — Week 3 May 2026
-- Run this in Supabase SQL editor.
--
-- Trims Garfields to 5 active pages and Goofies to 5 active pages.
-- Sherus is unchanged.
--
-- Safe to re-run (idempotent).
-- Does NOT delete any rows from `pages`, `six_day_entries`, or any
-- other table — all historical views are preserved.
-- =====================================================================

-- ------------------------------------------------------------------
-- Garfields → 5 pages
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  'bizzindia',
  'indianfoundersco',
  'startupbydog',
  'indianbusinesscom',
  'entrepreneursindia.co'
]::text[]
WHERE name = 'FBS - Garfields';

-- ------------------------------------------------------------------
-- Goofies → 5 pages
-- ------------------------------------------------------------------
UPDATE tracker_niches
SET pages = ARRAY[
  '101xfounders',
  'foundersinindia',
  'startupsinthelast24hrs',
  'startupcoded',
  'indiastartupstory'
]::text[]
WHERE name = 'FBS - Goofies';

-- ------------------------------------------------------------------
-- Sherus — no change (kept as-is: thechangingorder)
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------------
SELECT name,
       cardinality(pages) AS page_count,
       pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'FBS - Sherus')
ORDER BY name;
