-- Add editing/authorship fields to exp_idea_bank
ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS currently_editing_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS edited_by            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS test_result          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_format         TEXT NOT NULL DEFAULT '';
