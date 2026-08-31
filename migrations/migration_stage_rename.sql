-- Production pipeline stage rename: collapse the old content-type-specific mid-pipeline
-- stages (base_edit/script_hook/designed/formatted) into one "under_edit" stage, shared
-- by reels and carousels now. Also adds the two new mandatory-comment columns for the new
-- "changes"/"blocked" stages. Each playbook is a fully separate physical table (see
-- experiment_playbooks.py PLAYBOOK_TABLES) — apply to all three, not just bpb's
-- exp_idea_bank.
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS changes_comment TEXT;
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
UPDATE exp_idea_bank SET status = 'under_edit'
  WHERE status IN ('base_edit', 'script_hook', 'designed', 'formatted');

ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS changes_comment TEXT;
ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
UPDATE xf_idea_bank SET status = 'under_edit'
  WHERE status IN ('base_edit', 'script_hook', 'designed', 'formatted');

ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS changes_comment TEXT;
ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
UPDATE tech_idea_bank SET status = 'under_edit'
  WHERE status IN ('base_edit', 'script_hook', 'designed', 'formatted');
