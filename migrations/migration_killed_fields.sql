-- Bandwidth tracker: kill-stage attribution on tracker_ideas.
-- Captures WHO killed an idea (CS rejecting a new idea, CDI killing
-- during testing, etc.) so the Bandwidth page can show a Killed cell
-- per person alongside Comp / OG / Base edit / Testing / Proven / Posted.
-- Safe to run multiple times.

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS killed_by TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS killed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tracker_ideas_killed_at ON tracker_ideas (killed_at);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_killed_by ON tracker_ideas (killed_by);
