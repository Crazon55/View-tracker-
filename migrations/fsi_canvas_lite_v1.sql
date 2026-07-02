-- FSI Canvas Lite V1.1 — structured study graph (studies, nodes, connections, media)
-- Run in Supabase SQL editor. Safe to re-run (idempotent where possible).

DO $$ BEGIN
  CREATE TYPE study_type_enum AS ENUM (
    'Whiteboard',
    'Page Study',
    'Carousel Study',
    'Hook Study',
    'Visual Pattern Study',
    'Competitor Study',
    'Client Narrative Study',
    'New Page Strategy'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE node_type_enum AS ENUM (
    'Page',
    'Post Example',
    'Carousel Example',
    'Reel Example',
    'Content Pillar',
    'Content Bucket',
    'Hook Pattern',
    'Hook Example',
    'Visual Pattern',
    'Topic Pattern',
    'Audience Insight',
    'Strategy Rule',
    'Warning / What To Avoid',
    'Repeatable Formula',
    'Client Narrative Angle',
    'Strategist Note',
    'Performance Insight'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  study_type study_type_enum NOT NULL,
  target_account VARCHAR(255) NOT NULL,
  niche_vertical VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  execution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meta_notes TEXT,
  status VARCHAR(50) DEFAULT 'Draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  node_type node_type_enum NOT NULL,
  display_title VARCHAR(255) NOT NULL,
  canvas_x DOUBLE PRECISION NOT NULL,
  canvas_y DOUBLE PRECISION NOT NULL,
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_body_text TEXT,
  tags TEXT[],
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS node_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  media_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  edge_label_note TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT prevent_self_loops CHECK (source_node_id <> target_node_id)
);

CREATE TABLE IF NOT EXISTS study_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fsi_nodes_study_id ON nodes(study_id);
CREATE INDEX IF NOT EXISTS idx_fsi_connections_study_id ON connections(study_id);
CREATE INDEX IF NOT EXISTS idx_fsi_connections_source ON connections(source_node_id);
CREATE INDEX IF NOT EXISTS idx_fsi_connections_target ON connections(target_node_id);
CREATE INDEX IF NOT EXISTS idx_fsi_study_summaries_study_id ON study_summaries(study_id);

-- Verification
SELECT 'studies' AS tbl, COUNT(*) AS rows FROM studies
UNION ALL SELECT 'nodes', COUNT(*) FROM nodes
UNION ALL SELECT 'connections', COUNT(*) FROM connections;
