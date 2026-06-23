-- FSI Canvas Lite — RLS for direct frontend Supabase access (same pattern as blue_ocean_rls_policies.sql)
-- Run in Supabase SQL Editor after fsi_canvas_lite_v1.sql
-- REQUIRED: without these policies, authenticated canvas writes fail and data is lost on the client.

ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsi_authenticated_all" ON studies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "fsi_authenticated_all" ON nodes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "fsi_authenticated_all" ON connections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "fsi_authenticated_all" ON node_media
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "fsi_authenticated_all" ON study_summaries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
