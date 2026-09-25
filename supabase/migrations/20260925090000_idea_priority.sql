-- How urgent an idea is, so the person producing it knows what to pick up first.
--
-- An assigned producer saw a list of ideas with deadlines and no other signal. A
-- deadline says when something is due, not what to drop — two things due Friday can be
-- very different amounts of "now", and the answer was living in whoever remembered to
-- say it out loud.
--
--   P0  drop everything, this is the only thing you are on
--   P1  important, move on it quickly
--   P2  pick up once P0 and P1 are clear
--
-- Default P1, deliberately. Defaulting to P0 makes the top level meaningless within a
-- week; defaulting to P2 means nothing gets made unless someone remembers to raise it.
-- P1 is what ordinary assigned work is, and the other two are a decision someone took.

alter table ideas add column if not exists priority text not null default 'P1';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'ideas'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%priority%'
  ) then
    alter table ideas add constraint ideas_priority_check
      check (priority in ('P0', 'P1', 'P2'));
  end if;
end $$;
