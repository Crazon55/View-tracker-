-- Content tracker: which Instagram pages an idea is approved to run on
-- while it sits in the "Approved" stage (subset of pages under the
-- selected niches). Stored as JSON array of page handles, same strings as
-- in tracker_niches.pages. Safe to run multiple times.

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS approved_for_pages JSONB DEFAULT '[]'::jsonb;
