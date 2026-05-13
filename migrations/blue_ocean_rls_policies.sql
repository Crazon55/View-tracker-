-- Fix: RLS policies for Blue Ocean tables
-- Run this in Supabase SQL Editor

ALTER TABLE blue_ocean_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE blue_ocean_scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blue_ocean_scraped_posts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (internal tool)
CREATE POLICY "authenticated_all" ON blue_ocean_ideas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON blue_ocean_scrape_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON blue_ocean_scraped_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
