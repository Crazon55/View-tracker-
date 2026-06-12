-- =====================================================================
-- Separate database tables for XF and TECH playbooks
-- (BPB continues using legacy exp_* tables — existing data unchanged)
--
-- Run once in Supabase SQL Editor after experiment_playbooks.sql (if run).
-- Safe to re-run (IF NOT EXISTS).
-- =====================================================================

-- ------------------------------------------------------------------
-- XF Playbook
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xf_idea_bank (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_handle         TEXT NOT NULL,
  content_type        TEXT NOT NULL DEFAULT 'reel',
  topic               TEXT NOT NULL DEFAULT '',
  script              TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft',
  views               INTEGER NOT NULL DEFAULT 0,
  week_number         INTEGER NOT NULL DEFAULT 1,
  day_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source              TEXT NOT NULL DEFAULT 'original',
  hook_variations     TEXT NOT NULL DEFAULT '',
  music_ref           TEXT NOT NULL DEFAULT '',
  frame_link          TEXT NOT NULL DEFAULT '',
  yt_url              TEXT NOT NULL DEFAULT '',
  yt_timestamps       TEXT NOT NULL DEFAULT '',
  comp_link           TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  currently_editing_by TEXT NOT NULL DEFAULT '',
  edited_by           TEXT NOT NULL DEFAULT '',
  test_result         TEXT NOT NULL DEFAULT '',
  video_format        TEXT NOT NULL DEFAULT '',
  page_views          JSONB NOT NULL DEFAULT '{}',
  page_test_results   JSONB NOT NULL DEFAULT '{}',
  frontseat_pool      BOOLEAN NOT NULL DEFAULT FALSE,
  source_pool_id      UUID REFERENCES xf_idea_bank(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_xf_idea_bank_week_page ON xf_idea_bank (week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_xf_idea_bank_day ON xf_idea_bank (day_date);
CREATE INDEX IF NOT EXISTS idx_xf_idea_bank_pool ON xf_idea_bank (frontseat_pool);
CREATE INDEX IF NOT EXISTS idx_xf_idea_bank_source_pool ON xf_idea_bank (source_pool_id);

CREATE TABLE IF NOT EXISTS xf_content_bank (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES xf_idea_bank(id) ON DELETE SET NULL,
  page_handle     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'reel',
  topic           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  views           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  week_number     INTEGER NOT NULL,
  week_label      TEXT NOT NULL DEFAULT '',
  day_date        DATE NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT NOT NULL DEFAULT 'original',
  hook_variations TEXT NOT NULL DEFAULT '',
  music_ref       TEXT NOT NULL DEFAULT '',
  frame_link      TEXT NOT NULL DEFAULT '',
  yt_url          TEXT NOT NULL DEFAULT '',
  yt_timestamps   TEXT NOT NULL DEFAULT '',
  comp_link       TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  page_views      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_xf_content_bank_week_page ON xf_content_bank (week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_xf_content_bank_source ON xf_content_bank (source_id);

CREATE TABLE IF NOT EXISTS xf_working_ideas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES xf_idea_bank(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_xf_working_ideas_source ON xf_working_ideas (source_id);
CREATE INDEX IF NOT EXISTS idx_xf_working_ideas_week ON xf_working_ideas (week_number);

CREATE TABLE IF NOT EXISTS xf_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_goal             INTEGER NOT NULL DEFAULT 100000,
  experiment_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO xf_settings (view_goal, experiment_start_date)
SELECT 100000, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM xf_settings);

-- ------------------------------------------------------------------
-- TECH Playbook
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tech_idea_bank (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_handle         TEXT NOT NULL,
  content_type        TEXT NOT NULL DEFAULT 'reel',
  topic               TEXT NOT NULL DEFAULT '',
  script              TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft',
  views               INTEGER NOT NULL DEFAULT 0,
  week_number         INTEGER NOT NULL DEFAULT 1,
  day_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source              TEXT NOT NULL DEFAULT 'original',
  hook_variations     TEXT NOT NULL DEFAULT '',
  music_ref           TEXT NOT NULL DEFAULT '',
  frame_link          TEXT NOT NULL DEFAULT '',
  yt_url              TEXT NOT NULL DEFAULT '',
  yt_timestamps       TEXT NOT NULL DEFAULT '',
  comp_link           TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  currently_editing_by TEXT NOT NULL DEFAULT '',
  edited_by           TEXT NOT NULL DEFAULT '',
  test_result         TEXT NOT NULL DEFAULT '',
  video_format        TEXT NOT NULL DEFAULT '',
  page_views          JSONB NOT NULL DEFAULT '{}',
  page_test_results   JSONB NOT NULL DEFAULT '{}',
  frontseat_pool      BOOLEAN NOT NULL DEFAULT FALSE,
  source_pool_id      UUID REFERENCES tech_idea_bank(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tech_idea_bank_week_page ON tech_idea_bank (week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_tech_idea_bank_day ON tech_idea_bank (day_date);
CREATE INDEX IF NOT EXISTS idx_tech_idea_bank_pool ON tech_idea_bank (frontseat_pool);
CREATE INDEX IF NOT EXISTS idx_tech_idea_bank_source_pool ON tech_idea_bank (source_pool_id);

CREATE TABLE IF NOT EXISTS tech_content_bank (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES tech_idea_bank(id) ON DELETE SET NULL,
  page_handle     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'reel',
  topic           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  views           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  week_number     INTEGER NOT NULL,
  week_label      TEXT NOT NULL DEFAULT '',
  day_date        DATE NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT NOT NULL DEFAULT 'original',
  hook_variations TEXT NOT NULL DEFAULT '',
  music_ref       TEXT NOT NULL DEFAULT '',
  frame_link      TEXT NOT NULL DEFAULT '',
  yt_url          TEXT NOT NULL DEFAULT '',
  yt_timestamps   TEXT NOT NULL DEFAULT '',
  comp_link       TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  page_views      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tech_content_bank_week_page ON tech_content_bank (week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_tech_content_bank_source ON tech_content_bank (source_id);

CREATE TABLE IF NOT EXISTS tech_working_ideas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES tech_idea_bank(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_tech_working_ideas_source ON tech_working_ideas (source_id);
CREATE INDEX IF NOT EXISTS idx_tech_working_ideas_week ON tech_working_ideas (week_number);

CREATE TABLE IF NOT EXISTS tech_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_goal             INTEGER NOT NULL DEFAULT 100000,
  experiment_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tech_settings (view_goal, experiment_start_date)
SELECT 100000, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tech_settings);

-- Optional: move any xf/tech rows out of shared exp_* if playbook_id column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exp_idea_bank' AND column_name = 'playbook_id'
  ) THEN
    INSERT INTO xf_idea_bank (
      id, page_handle, content_type, topic, script, status, views, week_number, day_date,
      created_at, source, hook_variations, music_ref, frame_link, yt_url, yt_timestamps,
      comp_link, created_by, currently_editing_by, edited_by, test_result, video_format,
      page_views, page_test_results, frontseat_pool, source_pool_id
    )
    SELECT
      id, page_handle, content_type, topic, script, status, views, week_number, day_date,
      created_at, source, hook_variations, music_ref, frame_link, yt_url, yt_timestamps,
      comp_link, created_by, currently_editing_by, edited_by, test_result, video_format,
      page_views, page_test_results, frontseat_pool, source_pool_id
    FROM exp_idea_bank
    WHERE playbook_id = 'xf'
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tech_idea_bank (
      id, page_handle, content_type, topic, script, status, views, week_number, day_date,
      created_at, source, hook_variations, music_ref, frame_link, yt_url, yt_timestamps,
      comp_link, created_by, currently_editing_by, edited_by, test_result, video_format,
      page_views, page_test_results, frontseat_pool, source_pool_id
    )
    SELECT
      id, page_handle, content_type, topic, script, status, views, week_number, day_date,
      created_at, source, hook_variations, music_ref, frame_link, yt_url, yt_timestamps,
      comp_link, created_by, currently_editing_by, edited_by, test_result, video_format,
      page_views, page_test_results, frontseat_pool, source_pool_id
    FROM exp_idea_bank
    WHERE playbook_id = 'tech'
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM exp_idea_bank WHERE playbook_id IN ('xf', 'tech');
  END IF;
END $$;
