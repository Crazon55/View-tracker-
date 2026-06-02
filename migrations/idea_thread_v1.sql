-- Idea Thread v1: assignments + comments for communication between
-- CS/CW and their editors/carousel_designers on approved idea cards.
--
-- idea_assignments: who is tagged on a tracker idea (the executor/collaborator)
-- idea_comments: the back-and-forth between creator and tagged person

-- ── idea_assignments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idea_assignments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id          UUID NOT NULL REFERENCES tracker_ideas(id) ON DELETE CASCADE,
  assignee_email   TEXT NOT NULL,
  assignee_name    TEXT NOT NULL,
  assigned_by_email TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_assignments_idea    ON idea_assignments(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_assignments_assignee ON idea_assignments(assignee_email);

-- ── idea_comments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idea_comments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id      UUID NOT NULL REFERENCES tracker_ideas(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  text         TEXT NOT NULL,
  -- 'comment' | 'blocker' | 'update' | 'review_request'
  type         TEXT NOT NULL DEFAULT 'comment'
                 CHECK (type IN ('comment', 'blocker', 'update', 'review_request')),
  attachment_url TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_comments_idea ON idea_comments(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_comments_created ON idea_comments(idea_id, created_at);

-- ── RLS policies ──────────────────────────────────────────────────────────────

ALTER TABLE idea_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_comments    ENABLE ROW LEVEL SECURITY;

-- All authenticated users in the domain can read assignments and comments
CREATE POLICY "read_idea_assignments" ON idea_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "read_idea_comments" ON idea_comments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert/update/delete go through the backend API (service role), not direct client
CREATE POLICY "backend_idea_assignments" ON idea_assignments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "backend_idea_comments" ON idea_comments
  FOR ALL USING (auth.role() = 'service_role');
