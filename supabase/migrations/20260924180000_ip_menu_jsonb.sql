-- The posting cadence needs structure, so `ips.menu` becomes jsonb.
--
-- It was text[] — a flat list of labels, carried over from the demo seed and read by
-- nothing. The cadence the team actually works to is per slot: "Post 2 is Proven BO or
-- Happening, Reel 1 is an A-roll clip". That needs an object per slot:
--
--   [{ "id": "slot-a1b2c3d", "kind": "post" | "reel", "options": ["Proven BO", "Happening"] }]
--
-- Existing values are discarded rather than converted. Every row held either an empty
-- array or a set of labels with no slot behind them, so there is nothing to preserve and
-- a half-converted row would read as a real plan. The cadence is re-seeded after this
-- runs; see supabase/seed_cadence.py.
--
-- `ranges` is already jsonb and keeps its meaning: {posts: [min, max], reels: [min, max]}
-- for the pages that run a band rather than a fixed number.

alter table ips
  alter column menu drop default;

alter table ips
  alter column menu type jsonb using '[]'::jsonb;

alter table ips
  alter column menu set default '[]'::jsonb,
  alter column menu set not null;
