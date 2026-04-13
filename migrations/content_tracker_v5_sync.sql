-- Tags field for tracker ideas (e.g. comp_research)
ALTER TABLE tracker_ideas ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
