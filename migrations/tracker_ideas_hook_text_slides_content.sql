-- =====================================================================
-- Post tracker: `hook_text` and `slides_content` (carousel copy)
-- Run in Supabase SQL editor. Safe to re-run (idempotent).
-- =====================================================================
-- `hook_text`      : Short hook line for the post (separate from caption)
-- `slides_content` : JSON array of strings, one per carousel slide, e.g.
--                    [ "First slide", "Second slide" ]::jsonb

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS hook_text TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS slides_content JSONB DEFAULT '[]'::jsonb;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tracker_ideas'
  AND column_name IN ('hook_text', 'slides_content')
ORDER BY column_name;
