-- Add per-page views JSON column to exp_idea_bank and exp_content_bank
-- Stores {page_handle: view_count} map, e.g. {"indianfoundersco": 50000, "indianbusinesscom": 80000}

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS page_views JSONB NOT NULL DEFAULT '{}';

ALTER TABLE exp_content_bank
  ADD COLUMN IF NOT EXISTS page_views JSONB NOT NULL DEFAULT '{}';

-- Add per-page test results JSON column to exp_idea_bank
-- Stores {page_handle: result} map, e.g. {"indianfoundersco": "above_baseline", "indianbusinesscom": "top_line"}

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS page_test_results JSONB NOT NULL DEFAULT '{}';
