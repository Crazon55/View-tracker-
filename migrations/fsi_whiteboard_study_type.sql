-- FSI Whiteboard — add Whiteboard to study_type_enum
-- Prefer running the full sync: migrations/fsi_schema_sync.sql (idempotent, all FSI enums)

ALTER TYPE study_type_enum ADD VALUE IF NOT EXISTS 'Whiteboard';
