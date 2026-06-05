-- Add currently_editing_by to exp_idea_bank
-- Set when a user opens the detail modal, cleared on close.
ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS currently_editing_by TEXT NOT NULL DEFAULT '';
