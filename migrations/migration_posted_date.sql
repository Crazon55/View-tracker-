-- The Posted column's "still shows until end of day" carryover was keyed off day_date
-- (when the idea was DISTRIBUTED), not when it was actually POSTED — so a card created
-- days earlier vanished from Production the instant it was marked posted, instead of
-- lingering until end of that day. posted_date is stamped server-side (see
-- exp_update_idea) the moment status becomes "posted", giving a real, purpose-built date
-- to filter on. Apply to all three playbook tables (see experiment_playbooks.py
-- PLAYBOOK_TABLES).
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS posted_date DATE;
ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS posted_date DATE;
ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS posted_date DATE;

-- Backfill existing posted rows so none of them silently vanish once the Production
-- filter switches to checking posted_date instead of day_date. Prefer the real per-page
-- posting date already recorded in page_posting_dates; fall back to day_date for any row
-- that somehow doesn't have one.
UPDATE exp_idea_bank SET posted_date = COALESCE(
  NULLIF(page_posting_dates ->> trim(page_handle), '')::date, day_date
) WHERE status = 'posted' AND posted_date IS NULL;
UPDATE xf_idea_bank SET posted_date = COALESCE(
  NULLIF(page_posting_dates ->> trim(page_handle), '')::date, day_date
) WHERE status = 'posted' AND posted_date IS NULL;
UPDATE tech_idea_bank SET posted_date = COALESCE(
  NULLIF(page_posting_dates ->> trim(page_handle), '')::date, day_date
) WHERE status = 'posted' AND posted_date IS NULL;
