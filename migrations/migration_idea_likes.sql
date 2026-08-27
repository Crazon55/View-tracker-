-- Likes tracking for carousel ideas — mirrors views/page_views exactly (same
-- per-page-breakdown shape), since carousels can be posted to multiple pages
-- just like reels. Used by Idea Engine's "Top 6" best-performing-ideas feature.
-- Each playbook is a fully separate physical table (see experiment_playbooks.py
-- PLAYBOOK_TABLES) — apply to all three, not just bpb's exp_idea_bank.
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
ALTER TABLE exp_idea_bank ADD COLUMN IF NOT EXISTS page_likes JSONB DEFAULT '{}';

ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
ALTER TABLE xf_idea_bank ADD COLUMN IF NOT EXISTS page_likes JSONB DEFAULT '{}';

ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
ALTER TABLE tech_idea_bank ADD COLUMN IF NOT EXISTS page_likes JSONB DEFAULT '{}';
