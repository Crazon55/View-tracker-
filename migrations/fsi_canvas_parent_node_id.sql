-- FSI Canvas — parent/child hierarchy (Godot-style scene tree)
-- Run in Supabase SQL Editor after fsi_canvas_lite_v1.sql

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS parent_node_id UUID REFERENCES nodes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fsi_nodes_parent_id ON nodes(parent_node_id);
