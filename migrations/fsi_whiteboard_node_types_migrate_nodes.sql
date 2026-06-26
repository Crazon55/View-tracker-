-- FSI Whiteboard — step 2: migrate legacy nodes to whiteboard types
-- Run AFTER fsi_whiteboard_node_types.sql has committed successfully.

UPDATE nodes SET node_type = 'Page Name' WHERE node_type IN ('Page', 'Niche');
UPDATE nodes SET node_type = 'Visual'
  WHERE node_type IN ('Post Example', 'Carousel Example', 'Reel Example')
     OR (node_type = 'Visual Pattern' AND (structured_payload->>'is_screenshot')::boolean IS TRUE);
UPDATE nodes SET node_type = 'Written Hook' WHERE node_type IN ('Hook Pattern', 'Hook Example');
UPDATE nodes SET node_type = 'Performance' WHERE node_type = 'Performance Insight';
UPDATE nodes SET node_type = 'Sticky Note'
  WHERE node_type = 'Strategist Note'
    AND (
      (structured_payload->>'is_note')::boolean IS TRUE
      OR (structured_payload->>'freeform')::boolean IS TRUE
      OR (structured_payload->>'is_sticky')::boolean IS TRUE
    );

UPDATE nodes SET structured_payload = structured_payload || '{"is_sticky":true}'::jsonb
  WHERE node_type = 'Sticky Note' AND NOT (structured_payload ? 'is_sticky');
