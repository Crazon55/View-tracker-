-- Persist React Flow handle ids on connections (which side of each node the edge uses).
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS source_handle VARCHAR(32),
  ADD COLUMN IF NOT EXISTS target_handle VARCHAR(32);
