-- Adjustments found while mapping the real snoboard data.
--
-- 1. Growth: snoboard's growth_data holds monthly VIEWS (and followers) for months before
--    the 6-Day Tracker existed (from Dec 2025). Keep them; 6-Day cycle sums still win for
--    any month/IP that has cycle data (same rule as snoboard's /api/v1/growth).
-- 2. Stable legacy ids so the snoboard import can be re-run without duplicates.

drop table if exists growth_followers;

create table if not exists growth_monthly (
  month            date not null check (extract(day from month) = 1),
  ip_id            uuid not null references ips (id) on delete cascade,
  views            bigint,             -- null = use 6-Day cycle sums for this month
  followers_gained integer not null default 0,
  primary key (month, ip_id)
);
alter table growth_monthly enable row level security;

alter table six_day_top_content add column if not exists legacy_id uuid unique;
alter table tickets add column if not exists legacy_id uuid unique;
