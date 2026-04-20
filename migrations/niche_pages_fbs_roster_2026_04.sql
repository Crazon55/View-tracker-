-- =====================================================================
-- FBS team roster sync — ONE-SHOT fix
-- Run this in Supabase SQL editor.
--
-- It does three things in order:
--   1. Upserts every canonical handle into `pages` so the 6-day tracker,
--      leaderboard aggregates and reel/post tracker page dropdowns all
--      see them (keeps existing rows untouched — inserts only missing).
--   2. Replaces `tracker_niches.pages` for Garfields + Goofies with the
--      canonical master list (overwrites any stale short-aliases like
--      "lolxfounders", "fii", "bip" etc.).
--   3. Prints a verification query so you can eyeball the result.
--
-- Safe to re-run any time. Does not touch tracker_ideas.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) Ensure every handle exists in the `pages` table
-- ------------------------------------------------------------------
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES
  -- Garfields (11)
  ('bizzindia',            'Bizz India',             'https://www.instagram.com/bizzindia/',            false, 1),
  ('indianfoundersco',     'Indian Founders Co',     'https://www.instagram.com/indianfoundersco/',     false, 1),
  ('startupbydog',         'Startupbydog',           'https://www.instagram.com/startupbydog/',         false, 1),
  ('founderswtf',          'Founders WTF',           'https://www.instagram.com/founderswtf/',          false, 1),
  ('entrepreneursindia.co','Entrepreneursindia.co',  'https://www.instagram.com/entrepreneursindia.co/',false, 1),
  ('richindianceo',        'Rich Indian CEO',        'https://www.instagram.com/richindianceo/',        false, 1),
  ('therisingfounder',     'The Rising Founder',     'https://www.instagram.com/therisingfounder/',     false, 1),
  ('millionaire.founders', 'Millionaire.founders',   'https://www.instagram.com/millionaire.founders/', false, 1),
  ('indianbusinesscom',    'Indian Business Com',    'https://www.instagram.com/indianbusinesscom/',    false, 1),
  ('ceohustleadvice',      'CEO Hustle Advice',      'https://www.instagram.com/ceohustleadvice/',      false, 1),
  ('therealfoundr',        'The Real Foundr',        'https://www.instagram.com/therealfoundr/',        false, 1),
  -- Goofies (13)
  ('101xfounders',         '101xfounders',           'https://www.instagram.com/101xfounders/',         false, 1),
  ('foundersinindia',      'Founders In India',      'https://www.instagram.com/foundersinindia/',      false, 1),
  ('startupcoded',         'Startup Coded',          'https://www.instagram.com/startupcoded/',         false, 1),
  ('indiastartupstory',    'India Startup Story',    'https://www.instagram.com/indiastartupstory/',    false, 1),
  ('elitefoundrs',         'Elite Founders',         'https://www.instagram.com/elitefoundrs/',         false, 1),
  ('indianfoundrs',        'Indian Foundrs',         'https://www.instagram.com/indianfoundrs/',        false, 1),
  ('startupsinthelast24hrs','Startupsinthelast24hrs','https://www.instagram.com/startupsinthelast24hrs/',false, 1),
  ('realindianbusiness',   'Real Indian Business',   'https://www.instagram.com/realindianbusiness/',   false, 1),
  ('foundersoncrack',      'Foundersoncrack',        'https://www.instagram.com/foundersoncrack/',      false, 1),
  ('entrepreneurial.india','Entrepreneurial.India',  'https://www.instagram.com/entrepreneurial.india/',false, 1),
  ('theprimefounder',      'The Prime Founder',      'https://www.instagram.com/theprimefounder/',      false, 1),
  ('indiasbestfounders',   'India''s Best Founders', 'https://www.instagram.com/indiasbestfounders/',   false, 1),
  ('businesscracked',      'Business Cracked',       'https://www.instagram.com/businesscracked/',      false, 1)
ON CONFLICT (handle) DO NOTHING;

-- ------------------------------------------------------------------
-- 2) Ensure the two FBS niches exist
-- ------------------------------------------------------------------
INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Garfields', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Garfields');

INSERT INTO tracker_niches (name, pages)
SELECT 'FBS - Goofies', '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM tracker_niches WHERE name = 'FBS - Goofies');

-- ------------------------------------------------------------------
-- 3) Overwrite niche memberships with the canonical lists
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 4) Verify
-- ------------------------------------------------------------------
SELECT name,
       cardinality(pages) AS niche_handle_count,
       (
         SELECT count(*) FROM pages p WHERE p.handle = ANY(tracker_niches.pages)
       ) AS matched_in_pages_table,
       pages
FROM tracker_niches
WHERE name IN ('FBS - Garfields', 'FBS - Goofies', 'Tech')
ORDER BY name;
