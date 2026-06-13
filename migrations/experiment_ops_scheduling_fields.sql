-- =====================================================================
-- Playbook experiments — per-page scheduling (all playbook table sets)
-- page_posting_dates, page_posting_times, page_captions (JSONB per page)
-- Drops mistaken single-column fields if a prior migration ran.
-- Safe to re-run.
-- =====================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'exp_idea_bank', 'exp_content_bank',
    'xf_idea_bank', 'xf_content_bank',
    'tech_idea_bank', 'tech_content_bank'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS drive_link', tbl);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS posting_date', tbl);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS posting_time', tbl);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS caption', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS page_posting_dates JSONB NOT NULL DEFAULT %L', tbl, '{}');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS page_posting_times JSONB NOT NULL DEFAULT %L', tbl, '{}');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS page_captions JSONB NOT NULL DEFAULT %L', tbl, '{}');
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_exp_idea_bank_posting_date;
DROP INDEX IF EXISTS idx_xf_idea_bank_posting_date;
DROP INDEX IF EXISTS idx_tech_idea_bank_posting_date;
