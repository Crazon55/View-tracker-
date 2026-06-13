-- Cross-playbook idea deployments (link ideas across exp_*, xf_*, tech_* tables)
-- origin_playbook + origin_idea_id point to the root creator idea (not intermediate copies).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['exp_idea_bank', 'xf_idea_bank', 'tech_idea_bank']
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS origin_playbook TEXT',
      tbl
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS origin_idea_id UUID',
      tbl
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (origin_playbook, origin_idea_id)',
      'idx_' || replace(tbl, '_idea_bank', '') || '_origin',
      tbl
    );
  END LOOP;
END $$;
