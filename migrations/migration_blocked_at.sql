-- Timestamp for when a Production card was last marked Blocked. Server-stamped (not
-- client-supplied) whenever status transitions to "blocked" — see exp_update_idea. Used
-- to give the team a 24h grace window on Production before a blocked card ages out of the
-- daily board and hands off to Idea Engine's "needs fixing" list instead.
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
