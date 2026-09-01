-- =====================================================================
-- Idea Engine — Jaskaran approve / reject (scorekeeping)
-- Separate from Production `status` (approved / under_edit / …).
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- =====================================================================

ALTER TABLE exp_idea_bank
  ADD COLUMN IF NOT EXISTS engine_review TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_at TIMESTAMPTZ;

ALTER TABLE xf_idea_bank
  ADD COLUMN IF NOT EXISTS engine_review TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_at TIMESTAMPTZ;

ALTER TABLE tech_idea_bank
  ADD COLUMN IF NOT EXISTS engine_review TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS engine_reviewed_at TIMESTAMPTZ;
