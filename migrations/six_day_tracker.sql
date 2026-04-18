-- 6-Day Performance Tracker (v2 — deterministic cycles, reconciliation)
--
-- Cycles are computed, not stored: for any month the windows are always
--   Cycle 1: 1st–6th   |  Cycle 2: 7th–12th  |  Cycle 3: 13th–18th
--   Cycle 4: 19th–24th |  Cycle 5: 25th–end-of-month
--
-- The user fills in views per IP per cycle window.

-- Drop v1 tables if they were already created
DROP TABLE IF EXISTS six_day_top_content;
DROP TABLE IF EXISTS six_day_entries;
DROP TABLE IF EXISTS six_day_cycles;
DROP TABLE IF EXISTS six_day_monthly_actuals;
DROP TABLE IF EXISTS six_day_config;

-- Per-IP views for each 6-day window
CREATE TABLE six_day_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,                  -- always 1st of month, e.g. 2026-04-01
  cycle_number INT NOT NULL CHECK (cycle_number BETWEEN 1 AND 5),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  views BIGINT DEFAULT 0,
  filled_by TEXT,                       -- email or name of whoever filled it
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (month, cycle_number, page_id)
);

-- Top performing reels/posts per cycle
CREATE TABLE six_day_top_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  cycle_number INT NOT NULL CHECK (cycle_number BETWEEN 1 AND 5),
  link TEXT NOT NULL,
  views BIGINT DEFAULT 0,
  page_handle TEXT,
  content_type TEXT DEFAULT 'reel' CHECK (content_type IN ('reel', 'post')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Month-end reconciliation: actual IG dashboard views per IP
CREATE TABLE six_day_monthly_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  actual_views BIGINT DEFAULT 0,
  notes TEXT,
  filled_by TEXT,
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (month, page_id)
);

-- Tracker assignment config (who is responsible for filling data)
CREATE TABLE six_day_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_email TEXT,
  assigned_role TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE six_day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE six_day_top_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE six_day_monthly_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE six_day_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on six_day_entries" ON six_day_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on six_day_top_content" ON six_day_top_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on six_day_monthly_actuals" ON six_day_monthly_actuals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on six_day_config" ON six_day_config FOR ALL USING (true) WITH CHECK (true);
