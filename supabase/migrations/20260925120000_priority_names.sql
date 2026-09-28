-- Priorities are named, not numbered.
--
-- They went in as P0/P1/P2, which is engineering shorthand — it tells a designer picking
-- up a job nothing unless somebody has already explained the scale. Urgent, Important
-- and Average say what they mean on sight, which is the whole point of putting a
-- priority on the card.
--
-- A separate migration rather than an edit to 20260925090000, because that one has
-- already run. Editing an applied migration leaves every database that ran it in a state
-- the file no longer describes.
--
-- Note for anyone who tried the rename by hand: changing only the check constraint fails,
-- or worse succeeds and then blocks every insert, because the column default is still
-- the old value. The default has to move with it — that is what the third statement is.

alter table ideas alter column priority drop default;

-- The old P0/P1/P2 check has to go BEFORE the values are renamed: it is also called
-- ideas_priority_check, and with it still in place the update to IMPORTANT is refused.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'ideas'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%priority%'
  loop
    execute format('alter table ideas drop constraint %I', c);
  end loop;
end $$;

update ideas set priority = case priority
  when 'P0' then 'URGENT'
  when 'P1' then 'IMPORTANT'
  when 'P2' then 'AVERAGE'
  else priority
end;

alter table ideas
  alter column priority set default 'IMPORTANT',
  add constraint ideas_priority_check
    check (priority in ('URGENT', 'IMPORTANT', 'AVERAGE'));
