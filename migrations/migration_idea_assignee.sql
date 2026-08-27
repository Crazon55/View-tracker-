-- Per-idea assignee — set once an idea has been distributed onto a page (Today's Board).
-- Who can be assigned depends on content_type (reel vs carousel); that option list lives
-- in the frontend config, not the DB — this column just stores whichever name was picked.

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;
