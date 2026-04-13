-- Post Tracker: additional fields for post ideas
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS format TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS main_page_hook TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS content_pillar TEXT;
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS content_bucket TEXT;
