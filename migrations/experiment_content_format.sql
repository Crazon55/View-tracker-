-- =====================================================================
-- Content format (News / A-roll) for every playbook's ideas.
-- A coarse editorial split, deliberately separate from the finer
-- video_format taxonomy (Viral a-roll / A-roll massy / Shark Tank / …)
-- so the two vocabularies don't collide in one column.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- =====================================================================

ALTER TABLE exp_idea_bank   ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';
ALTER TABLE xf_idea_bank    ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';
ALTER TABLE tech_idea_bank  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';

-- Content Bank holds the archived copies of the same rows.
ALTER TABLE exp_content_bank   ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';
ALTER TABLE xf_content_bank    ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';
ALTER TABLE tech_content_bank  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT '';

-- Verify — expect 6 rows.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE column_name = 'content_format'
ORDER BY table_name;
