-- Rejecting an idea, and HPN deadlines that are a time of day.
--
-- Two things the schema had no room for.
--
-- An idea could be approved or left pending, and that was all. In practice a reviewer
-- who does not want an idea has to either approve it anyway or leave it sitting in the
-- pending list forever, so "no" was being recorded as silence. `rejected` makes the
-- answer explicit, and `decision_note` carries the reason back to whoever raised it.
--
-- HPN is same-day work: a news idea is due in hours, not on a date. `deadline` is a
-- `date` column, so "by 4pm" had nowhere to go and every HPN idea showed a deadline of
-- today with no sense of urgency. `deadline_time` holds the clock time; `deadline`
-- still holds the day, so nothing that reads deadlines has to learn a new shape.

alter table ideas add column if not exists deadline_time time;
alter table ideas add column if not exists decision_note text;

-- The check constraint is auto-named, so find it rather than guess. Dropping and
-- recreating is the only way to widen an allowed-values check.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'ideas'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%approval_state%';
  if c is not null then
    execute format('alter table ideas drop constraint %I', c);
  end if;
end $$;

alter table ideas add constraint ideas_approval_state_check
  check (approval_state in ('pending', 'approved', 'rejected', 'not_required'));
