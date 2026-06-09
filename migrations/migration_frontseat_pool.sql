-- Two-layer Frontseat architecture
-- frontseat_pool = TRUE  → permanent pool idea (stays on left panel forever)
-- frontseat_pool = FALSE → page copy (goes through new → approved → … pipeline)
-- source_pool_id → links a copy back to its original pool idea

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS frontseat_pool BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS source_pool_id UUID REFERENCES exp_idea_bank(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_pool
  ON exp_idea_bank (frontseat_pool);

CREATE INDEX IF NOT EXISTS idx_exp_idea_bank_source_pool
  ON exp_idea_bank (source_pool_id);
