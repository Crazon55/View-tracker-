-- =====================================================================
-- Playbook experiments — ops scheduling fields (all playbook table sets)
-- drive_link, posting_date, posting_time, caption
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS drive_link TEXT NOT NULL DEFAULT %L', tbl, '');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS posting_date DATE', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS posting_time TEXT NOT NULL DEFAULT %L', tbl, '');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT %L', tbl, '');
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_posting_date ON exp_idea_bank (posting_date);
CREATE INDEX IF NOT EXISTS idx_xf_idea_bank_posting_date ON xf_idea_bank (posting_date);
CREATE INDEX IF NOT EXISTS idx_tech_idea_bank_posting_date ON tech_idea_bank (posting_date);
