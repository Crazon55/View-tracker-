-- Add page_id to six_day_top_content so each content item belongs to an IP
ALTER TABLE six_day_top_content
  ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Backfill existing rows: match page_handle to pages.handle
UPDATE six_day_top_content tc
SET page_id = p.id
FROM pages p
WHERE tc.page_id IS NULL
  AND lower(tc.page_handle) = lower(p.handle);
