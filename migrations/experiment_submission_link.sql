-- =====================================================================
-- Production — optional submission link for video editors & carousel
-- designers (Drive / Canva / export). Separate from base-edit drive.
-- Added to every playbook table set. Safe to re-run.
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS submission_link TEXT NOT NULL DEFAULT %L', tbl, '');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
