-- Content Tracker v2: expanded idea fields + posting perf tags

ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS hook_variations TEXT[] DEFAULT '{}';
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS music_ref TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS yt_url TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS yt_timestamps TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS comp_link TEXT;

ALTER TABLE tracker_postings ADD COLUMN IF NOT EXISTS perf_tag TEXT;
