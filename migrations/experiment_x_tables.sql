-- =====================================================================
-- Experiment X — Idea Tracking System
-- 3 working tables + 1 config table
--
-- Tables:
--   exp_idea_bank       → live daily idea entry (the main working surface)
--   exp_content_bank    → full cumulative archive, week → day filtered
--   exp_working_ideas   → auto-populated when views > goal threshold
--   exp_settings        → single-row config (view_goal, experiment_start_date)
--
-- Safe to re-run (IF NOT EXISTS on tables, upsert on settings row).
-- =====================================================================


-- ------------------------------------------------------------------
-- 1. exp_idea_bank  (live entry table)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exp_idea_bank (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_handle     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'reel',   -- reel | post
  topic           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | posted | killed
  views           INTEGER NOT NULL DEFAULT 0,
  week_number     INTEGER NOT NULL DEFAULT 1,
  day_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_week_page
  ON exp_idea_bank (week_number, page_handle);

CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_day
  ON exp_idea_bank (day_date);


-- ------------------------------------------------------------------
-- 2. exp_content_bank  (cumulative archive — pushed weekly)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exp_content_bank (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES exp_idea_bank(id) ON DELETE SET NULL,
  page_handle     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'reel',
  topic           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  views           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  week_number     INTEGER NOT NULL,
  week_label      TEXT NOT NULL DEFAULT '',       -- "Week 1 · Jun 2 – Jun 8"
  day_date        DATE NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_content_bank_week_page
  ON exp_content_bank (week_number, page_handle);

CREATE INDEX IF NOT EXISTS idx_exp_content_bank_source
  ON exp_content_bank (source_id);


-- ------------------------------------------------------------------
-- 3. exp_working_ideas  (proven ideas — auto-flagged at views > goal)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exp_working_ideas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES exp_idea_bank(id) ON DELETE SET NULL,
  page_handle     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'reel',
  topic           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  views_achieved  INTEGER NOT NULL DEFAULT 0,
  goal_threshold  INTEGER NOT NULL DEFAULT 100000,
  distributed     BOOLEAN NOT NULL DEFAULT FALSE,
  week_number     INTEGER NOT NULL DEFAULT 1,
  day_date        DATE,
  flagged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_working_ideas_source
  ON exp_working_ideas (source_id);

CREATE INDEX IF NOT EXISTS idx_exp_working_ideas_week
  ON exp_working_ideas (week_number);


-- ------------------------------------------------------------------
-- 4. exp_settings  (single-row config)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exp_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_goal             INTEGER NOT NULL DEFAULT 100000,
  experiment_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure exactly one settings row exists
INSERT INTO exp_settings (view_goal, experiment_start_date)
SELECT 100000, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM exp_settings);


-- ------------------------------------------------------------------
-- 5. Verify
-- ------------------------------------------------------------------
SELECT 'exp_idea_bank'    AS tbl, count(*) FROM exp_idea_bank    UNION ALL
SELECT 'exp_content_bank' AS tbl, count(*) FROM exp_content_bank UNION ALL
SELECT 'exp_working_ideas'AS tbl, count(*) FROM exp_working_ideas UNION ALL
SELECT 'exp_settings'     AS tbl, count(*) FROM exp_settings;
