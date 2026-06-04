-- =====================================================================
-- Experiment X — Add full idea fields to exp_idea_bank + exp_content_bank
-- Matches the Content Tracker idea form fields.
-- Safe to re-run (IF NOT EXISTS via ADD COLUMN IF NOT EXISTS).
-- =====================================================================

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS hook_variations TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS music_ref       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS frame_link      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS yt_url          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS yt_timestamps   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS comp_link       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by      TEXT NOT NULL DEFAULT '';

ALTER TABLE exp_content_bank
  ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS hook_variations TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS music_ref       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS frame_link      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS yt_url          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS yt_timestamps   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS comp_link       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by      TEXT NOT NULL DEFAULT '';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('exp_idea_bank', 'exp_content_bank')
  AND column_name IN ('source','hook_variations','music_ref','frame_link','yt_url','yt_timestamps','comp_link','created_by')
ORDER BY table_name, column_name;
