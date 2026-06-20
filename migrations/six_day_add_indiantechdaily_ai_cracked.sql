-- Add indiantechdaily + ai.cracked to pages table for 6-day tracker.
-- Safe to re-run.

INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
SELECT 'indiantechdaily', 'India Tech Daily', 'https://www.instagram.com/indiantechdaily/', false, 1
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE lower(trim(handle)) = 'indiantechdaily');

INSERT INTO pages (handle, name, profile_url, auto_scrape, stage)
SELECT 'ai.cracked', 'AI Cracked', 'https://www.instagram.com/ai.cracked/', false, 1
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE lower(trim(handle)) = 'ai.cracked');
