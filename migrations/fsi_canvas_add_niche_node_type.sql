-- Add Niche node type to FSI Canvas (run in Supabase SQL Editor after fsi_canvas_lite_v1.sql)

DO $$ BEGIN
  ALTER TYPE node_type_enum ADD VALUE 'Niche';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
