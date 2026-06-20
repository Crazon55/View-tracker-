-- Add indiantechdaily + ai.cracked (Tech niche) to pages for 6-day tracker.
-- Tracker shows them on alternating months from Jun 2026 cycle 2 (Jun, Aug, Oct…).
-- Safe to re-run.

INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
SELECT 'indiantechdaily', 'India Tech Daily', 'https://www.instagram.com/indiantechdaily/', false, 1
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE lower(trim(handle)) = 'indiantechdaily');

INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
SELECT 'ai.cracked', 'AI Cracked', 'https://www.instagram.com/ai.cracked/', false, 1
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE lower(trim(handle)) = 'ai.cracked');
