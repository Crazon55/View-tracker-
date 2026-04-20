-- Manual reel/post mix % on each six_day_entries row (0–100, nullable)
ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS reel_pct INT;
ALTER TABLE six_day_entries ADD COLUMN IF NOT EXISTS post_pct INT;
