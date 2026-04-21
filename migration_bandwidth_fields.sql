-- Bandwidth tracker: per-stage attribution on tracker_ideas.
-- Captures WHO did each key production step (base edit, Pintu batch set, posting)
-- so the Bandwidth page can credit CDI work per person.
-- Safe to run multiple times.

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS base_edit_by TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS base_edit_at TIMESTAMPTZ;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS pintu_set_by  TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS pintu_set_at  TIMESTAMPTZ;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS posted_by     TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS posted_at     TIMESTAMPTZ;

-- Helpful indexes for the Bandwidth aggregation queries.
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_base_edit_at ON tracker_ideas (base_edit_at);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_pintu_set_at ON tracker_ideas (pintu_set_at);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_posted_at    ON tracker_ideas (posted_at);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_created_by   ON tracker_ideas (created_by);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_base_edit_by ON tracker_ideas (base_edit_by);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_pintu_set_by ON tracker_ideas (pintu_set_by);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_posted_by    ON tracker_ideas (posted_by);
