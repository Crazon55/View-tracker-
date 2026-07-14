-- =====================================================================
-- Playbook experiments — per-page LIVE link (posted Instagram URL).
-- page_live_links: JSONB map {page_handle: url}, set by Content Ops in the
-- Tracking card. Added to every playbook table set. Safe to re-run.
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS page_live_links JSONB NOT NULL DEFAULT %L', tbl, '{}');
  END LOOP;
END $$;
