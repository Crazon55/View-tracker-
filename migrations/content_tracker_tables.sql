-- Content Tracker: niches, ideas with stage workflow, per-page postings

CREATE TABLE IF NOT EXISTS tracker_niches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pages TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracker_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT DEFAULT 'original',
  niche_id UUID REFERENCES tracker_niches(id) ON DELETE CASCADE,
  stage TEXT DEFAULT 'new',
  link TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracker_postings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID REFERENCES tracker_ideas(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  date DATE,
  baseline_views INTEGER DEFAULT 0,
  views INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_niche ON tracker_ideas(niche_id);
CREATE INDEX IF NOT EXISTS idx_tracker_ideas_stage ON tracker_ideas(stage);
CREATE INDEX IF NOT EXISTS idx_tracker_postings_idea ON tracker_postings(idea_id);
CREATE INDEX IF NOT EXISTS idx_tracker_postings_date ON tracker_postings(date);
