-- Add device column to pages for scheduling
ALTER TABLE pages ADD COLUMN IF NOT EXISTS device TEXT;

-- Add schedule fields to content_entries
ALTER TABLE content_entries ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE content_entries ADD COLUMN IF NOT EXISTS upload_time_window TEXT;
ALTER TABLE content_entries ADD COLUMN IF NOT EXISTS device TEXT;
