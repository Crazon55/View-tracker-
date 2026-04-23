-- Reel content tracker: Kalakar (editor) project link, filled in Base edit.
-- Safe to run multiple times.

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS kalakar_link TEXT;
