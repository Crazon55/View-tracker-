-- =====================================================================
-- FBS team roster sync: refresh Garfields + Goofies niche membership
-- Run this in Supabase SQL editor to update the filters used by:
--   * 6-Day Tracker niche filter
--   * Reel / Post tracker niche & page filters
--   * Leaderboard (/api/v1/teams/performance) team accounts
--
-- Idempotent: replaces the pages[] array wholesale with the canonical list.
-- Does not touch tracker_ideas; an idea stays in the niche it was created in.
-- =====================================================================

-- Ensure the two FBS niches exist (no-op if already created)
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Garfields', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Garfields');

INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Goofies', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Goofies');

-- Garfields (11 accounts)
UPDATE tracker_niches
SET pages = ARRAY[
  'bizzindia',
  'indianfoundersco',
  'startupbydog',
  'founderswtf',
  'entrepreneursindia.co',
  'richindianceo',
  'therisingfounder',
  'millionaire.founders',
  'indianbusinesscom',
  'ceohustleadvice',
  'therealfoundr'
]::text[]
WHERE name = 'FBS - Garfields';

-- Goofies (13 accounts)
UPDATE tracker_niches
SET pages = ARRAY[
  '101xfounders',
  'foundersinindia',
  'startupcoded',
  'indiastartupstory',
  'elitefoundrs',
  'indianfoundrs',
  'startupsinthelast24hrs',
  'realindianbusiness',
  'foundersoncrack',
  'entrepreneurial.india',
  'theprimefounder',
  'indiasbestfounders',
  'businesscracked'
]::text[]
WHERE name = 'FBS - Goofies';

-- Verify
SELECT name, cardinality(pages) AS account_count, pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'Tech')
ORDER BY name;
