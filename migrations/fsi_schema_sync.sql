-- FSI Canvas — idempotent schema sync (run on Supabase after any FSI deploy)
-- Safe to re-run. Ensures DB enums match app code (fsiNodeSchemas.ts, app/schemas/fsi.py).

-- study types
ALTER TYPE study_type_enum ADD VALUE IF NOT EXISTS 'Whiteboard';

-- whiteboard node types (run before fsi_whiteboard_node_types_migrate_nodes.sql on legacy DBs)
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Page Name';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Visual';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Visual Hook';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Written Hook';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Performance';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Link';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Sticky Note';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Frame';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Carousel Body';

-- legacy niche type (older installs)
DO $$ BEGIN
  ALTER TYPE node_type_enum ADD VALUE 'Niche';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
