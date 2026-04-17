-- Migrate old pipeline stages to new ones (reel tracker)
-- batch_edit + scale + idea_bank → proven_ideas
-- done → posted

UPDATE tracker_ideas SET stage = 'proven_ideas' WHERE stage IN ('batch_edit', 'scale', 'idea_bank') AND type = 'reel';
UPDATE tracker_ideas SET stage = 'posted' WHERE stage = 'done' AND type = 'reel';
