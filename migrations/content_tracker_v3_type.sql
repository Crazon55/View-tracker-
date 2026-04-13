-- Add type field to distinguish reels vs posts ideas
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'reel';
