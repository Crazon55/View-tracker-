-- Add playbook_id to Experiment (BPB / XF / TECH) tables.
-- Existing rows become playbook_id = 'bpb' (formerly Experiment X).

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS playbook_id TEXT NOT NULL DEFAULT 'bpb';

ALTER TABLE exp_content_bank
  ADD COLUMN IF NOT EXISTS playbook_id TEXT NOT NULL DEFAULT 'bpb';

ALTER TABLE exp_working_ideas
  ADD COLUMN IF NOT EXISTS playbook_id TEXT NOT NULL DEFAULT 'bpb';

ALTER TABLE exp_settings
  ADD COLUMN IF NOT EXISTS playbook_id TEXT;

UPDATE exp_settings SET playbook_id = 'bpb' WHERE playbook_id IS NULL;

INSERT INTO exp_settings (view_goal, experiment_start_date, playbook_id)
SELECT 100000, CURRENT_DATE, 'xf'
WHERE NOT EXISTS (SELECT 1 FROM exp_settings WHERE playbook_id = 'xf');

INSERT INTO exp_settings (view_goal, experiment_start_date, playbook_id)
SELECT 100000, CURRENT_DATE, 'tech'
WHERE NOT EXISTS (SELECT 1 FROM exp_settings WHERE playbook_id = 'tech');

CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_settings_playbook ON exp_settings (playbook_id);
CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_playbook ON exp_idea_bank (playbook_id, week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_exp_content_bank_playbook ON exp_content_bank (playbook_id, week_number, page_handle);
CREATE INDEX IF NOT EXISTS idx_exp_working_ideas_playbook ON exp_working_ideas (playbook_id, week_number);
