-- =====================================================================
-- Add `caption` and `canva_link` to tracker_ideas
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
-- =====================================================================
-- `caption`    : The Instagram caption text for a post/static idea
--                (replaces the previous "main_page_hook" + "hook_variations"
--                UX in PostTracker).
-- `canva_link` : Direct link to the Canva design for this idea. Shown both
--                while adding the idea and after it's scheduled.

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS canva_link TEXT;

-- Verify the columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tracker_ideas'
  AND column_name IN ('caption', 'canva_link')
ORDER BY column_name;
