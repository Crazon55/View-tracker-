-- FSI Whiteboard — add Whiteboard to study_type_enum
-- Required for creating new canvas studies (hub sends study_type: "Whiteboard").
-- Run in Supabase SQL editor on production if create study fails with:
--   invalid input value for enum study_type_enum: "Whiteboard"

ALTER TYPE study_type_enum ADD VALUE IF NOT EXISTS 'Whiteboard';
