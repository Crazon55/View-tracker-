-- Blue Ocean Ideas feature migration
-- Run in Supabase SQL Editor

-- Ideas bank (AI-generated and marked-as-blue-ocean scraped posts)
CREATE TABLE IF NOT EXISTS blue_ocean_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('article', 'instagram')),
    source TEXT NOT NULL DEFAULT 'ai_generated' CHECK (source IN ('ai_generated', 'apify_scraped')),
    headline_or_hook TEXT NOT NULL,
    format_tag TEXT,
    why_evergreen TEXT,
    outline_or_slides JSONB,
    hook_formula TEXT,
    status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'used', 'archived')),
    source_account TEXT,
    engagement_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apify scrape jobs tracker
CREATE TABLE IF NOT EXISTS blue_ocean_scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accounts TEXT[] NOT NULL,
    date_from TEXT,
    date_to TEXT,
    post_type TEXT DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
    posts_found INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Raw scraped posts from Apify competitor scrapes
CREATE TABLE IF NOT EXISTS blue_ocean_scraped_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES blue_ocean_scrape_jobs(id) ON DELETE CASCADE,
    account_handle TEXT,
    url TEXT,
    caption TEXT,
    thumbnail_url TEXT,
    post_type TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    posted_at TEXT,
    is_blue_ocean BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blue_ocean_ideas_type ON blue_ocean_ideas(type);
CREATE INDEX IF NOT EXISTS idx_blue_ocean_ideas_status ON blue_ocean_ideas(status);
CREATE INDEX IF NOT EXISTS idx_blue_ocean_scraped_posts_job ON blue_ocean_scraped_posts(job_id);
CREATE INDEX IF NOT EXISTS idx_blue_ocean_scraped_posts_blue_ocean ON blue_ocean_scraped_posts(is_blue_ocean);
