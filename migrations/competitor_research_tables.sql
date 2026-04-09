-- Competitor Research: 3 separate tables for FBS Reels, Tech Reels, FBS Posts

CREATE TABLE IF NOT EXISTS competitor_fbs_reels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_handle TEXT,
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  view_bucket TEXT,
  url TEXT UNIQUE,
  posted_at TIMESTAMPTZ,
  usage TEXT DEFAULT 'not_used',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_tech_reels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_handle TEXT,
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  view_bucket TEXT,
  url TEXT UNIQUE,
  posted_at TIMESTAMPTZ,
  usage TEXT DEFAULT 'not_used',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_fbs_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_handle TEXT,
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  view_bucket TEXT,
  url TEXT UNIQUE,
  posted_at TIMESTAMPTZ,
  usage TEXT DEFAULT 'not_used',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_fbs_reels_views ON competitor_fbs_reels(views DESC);
CREATE INDEX IF NOT EXISTS idx_fbs_reels_bucket ON competitor_fbs_reels(view_bucket);
CREATE INDEX IF NOT EXISTS idx_fbs_reels_posted ON competitor_fbs_reels(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tech_reels_views ON competitor_tech_reels(views DESC);
CREATE INDEX IF NOT EXISTS idx_tech_reels_bucket ON competitor_tech_reels(view_bucket);
CREATE INDEX IF NOT EXISTS idx_tech_reels_posted ON competitor_tech_reels(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_fbs_posts_views ON competitor_fbs_posts(views DESC);
CREATE INDEX IF NOT EXISTS idx_fbs_posts_bucket ON competitor_fbs_posts(view_bucket);
CREATE INDEX IF NOT EXISTS idx_fbs_posts_posted ON competitor_fbs_posts(posted_at DESC);
