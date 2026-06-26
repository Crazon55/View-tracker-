-- FSI Whiteboard — step 1: add new node_type_enum values
-- Run this file FIRST and wait for it to succeed before running
-- fsi_whiteboard_node_types_migrate_nodes.sql
--
-- PostgreSQL requires new enum values to be committed before they can be
-- referenced in UPDATE/INSERT (error 55P04 if combined in one transaction).

ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Page Name';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Visual';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Visual Hook';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Written Hook';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Performance';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Link';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Sticky Note';
ALTER TYPE node_type_enum ADD VALUE IF NOT EXISTS 'Frame';
