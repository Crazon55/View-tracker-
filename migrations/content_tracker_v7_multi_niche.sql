-- Add niche_ids array column for multi-niche support
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS niche_ids UUID[] DEFAULT '{}';

-- Backfill: copy existing niche_id into niche_ids array
UPDATE tracker_ideas
SET niche_ids = ARRAY[niche_id]
WHERE niche_id IS NOT NULL AND (niche_ids IS NULL OR niche_ids = '{}');
