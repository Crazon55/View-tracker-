-- Add deadline and assigned_role to content_entries
ALTER TABLE content_entries ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE content_entries ADD COLUMN IF NOT EXISTS assigned_role TEXT;

CREATE INDEX IF NOT EXISTS idx_content_entries_deadline ON content_entries(deadline);
CREATE INDEX IF NOT EXISTS idx_content_entries_assigned_role ON content_entries(assigned_role);
