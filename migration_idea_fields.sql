-- Add new fields to ideas table
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS hook_variations TEXT[] DEFAULT '{}';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS executor_name TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS yt_url TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS timestamps TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS base_drive_link TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS edited_drive_link TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS pintu_batch_link TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS comp_link TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS deadline DATE;

-- Update idea_code trigger: OG-xxx for original, CI-xxx for repurposed/competitor
CREATE OR REPLACE FUNCTION generate_idea_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.source = 'repurposed' THEN
    NEW.idea_code := 'CI-' || lpad(NEW.idea_number::text, 3, '0');
  ELSE
    NEW.idea_code := 'OG-' || lpad(NEW.idea_number::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing idea codes
UPDATE ideas SET idea_code = 'OG-' || lpad(idea_number::text, 3, '0') WHERE source = 'original';
UPDATE ideas SET idea_code = 'CI-' || lpad(idea_number::text, 3, '0') WHERE source = 'repurposed';

-- Update pipeline statuses
-- Old: idea, approved, edited, ready_to_upload, scheduled, uploaded, skipped, posted
-- New: idea, hooks_written, base_cut_edited, captions_written, scheduled, posted
