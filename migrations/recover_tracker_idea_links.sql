-- ============================================================================
-- Recovery script: restore comp_link on tracker_ideas that were created from
-- Competitor Research but got nulled out by the frontend blur bug.
--
-- How it works:
--   Ideas auto-created by the "Used" button in comp research always have:
--     - tags ⊇ 'comp_research'
--     - created_by = 'comp research'
--     - source = 'competitor'
--     - title = the original account_name OR account_handle
--
--   The original URL is still sitting in competitor_fbs_reels /
--   competitor_tech_reels / competitor_fbs_posts in the `url` column.
--
--   We match by (title) → (account_name) per idea type. The comp research
--   creator used `account_name` first, falling back to `account_handle`, so
--   we try both.
--
-- Safe to re-run: only updates rows where comp_link IS NULL, and only when
-- exactly one match is found (to avoid linking the wrong URL on ties).
-- ============================================================================

-- ---------- Reel ideas (type='reel') ----------
-- Try competitor_fbs_reels first (account_name match)
WITH candidates AS (
  SELECT ti.id AS idea_id, r.url, COUNT(*) OVER (PARTITION BY ti.id) AS n
  FROM tracker_ideas ti
  JOIN competitor_fbs_reels r
    ON (r.account_name = ti.title OR r.account_handle = ti.title)
  WHERE ti.source = 'competitor'
    AND ti.type = 'reel'
    AND ti.comp_link IS NULL
    AND 'comp_research' = ANY(COALESCE(ti.tags, '{}'::text[]))
)
UPDATE tracker_ideas ti
SET comp_link = c.url
FROM candidates c
WHERE ti.id = c.idea_id AND c.n = 1;

-- Then competitor_tech_reels for any still missing
WITH candidates AS (
  SELECT ti.id AS idea_id, r.url, COUNT(*) OVER (PARTITION BY ti.id) AS n
  FROM tracker_ideas ti
  JOIN competitor_tech_reels r
    ON (r.account_name = ti.title OR r.account_handle = ti.title)
  WHERE ti.source = 'competitor'
    AND ti.type = 'reel'
    AND ti.comp_link IS NULL
    AND 'comp_research' = ANY(COALESCE(ti.tags, '{}'::text[]))
)
UPDATE tracker_ideas ti
SET comp_link = c.url
FROM candidates c
WHERE ti.id = c.idea_id AND c.n = 1;

-- ---------- Post ideas (type='post') ----------
WITH candidates AS (
  SELECT ti.id AS idea_id, r.url, COUNT(*) OVER (PARTITION BY ti.id) AS n
  FROM tracker_ideas ti
  JOIN competitor_fbs_posts r
    ON (r.account_name = ti.title OR r.account_handle = ti.title)
  WHERE ti.source = 'competitor'
    AND ti.type = 'post'
    AND ti.comp_link IS NULL
    AND 'comp_research' = ANY(COALESCE(ti.tags, '{}'::text[]))
)
UPDATE tracker_ideas ti
SET comp_link = c.url
FROM candidates c
WHERE ti.id = c.idea_id AND c.n = 1;

-- ---------- Diagnostic: what's still missing after recovery ----------
--   Rows returned here are ideas whose link could NOT be auto-matched.
--   Either the title no longer matches any research row, or there are
--   multiple candidates (ambiguous) and we refused to guess.
SELECT
  ti.id,
  ti.title,
  ti.type,
  ti.tags,
  ti.created_at,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM competitor_fbs_reels  r WHERE r.account_name = ti.title OR r.account_handle = ti.title
      UNION ALL
      SELECT 1 FROM competitor_tech_reels r WHERE r.account_name = ti.title OR r.account_handle = ti.title
      UNION ALL
      SELECT 1 FROM competitor_fbs_posts  r WHERE r.account_name = ti.title OR r.account_handle = ti.title
    ) THEN 'no research row matches title'
    ELSE 'ambiguous - multiple research rows match this title'
  END AS recovery_note
FROM tracker_ideas ti
WHERE ti.source = 'competitor'
  AND ti.comp_link IS NULL
  AND 'comp_research' = ANY(COALESCE(ti.tags, '{}'::text[]))
ORDER BY ti.created_at DESC;
