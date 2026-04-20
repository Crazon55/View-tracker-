-- =====================================================================
-- Add "Best Indian Podcast" to FBS - Goofies
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
-- =====================================================================

-- 1) Make sure the page exists
INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
VALUES ('bestindianpodcast', 'Best Indian Podcast',
        'https://www.instagram.com/bestindianpodcast/', false, 1)
ON CONFLICT (handle) DO NOTHING;

-- 2) Append the handle to the Goofies niche only if it isn't already there
UPDATE tracker_niches
SET pages = pages || ARRAY['bestindianpodcast']::text[]
WHERE name = 'FBS - Goofies'
  AND NOT ('bestindianpodcast' = ANY(pages));

-- 3) Verify
SELECT name,
       cardinality(pages) AS niche_handle_count,
       pages
FROM tracker_niches
WHERE name = 'FBS - Goofies';
