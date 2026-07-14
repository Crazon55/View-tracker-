-- =====================================================================
-- Playbook experiments — extra idea reference links surfaced in the
-- Idea Engine cards: kalakar_link + drive_link (base-edit drive).
-- (comp_link / yt_url / yt_timestamps / frame_link already exist.)
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS kalakar_link TEXT NOT NULL DEFAULT %L', tbl, '');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS drive_link TEXT NOT NULL DEFAULT %L', tbl, '');
  END LOOP;
END $$;
