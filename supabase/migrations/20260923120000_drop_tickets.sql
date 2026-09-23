-- Remove the ticket system.
--
-- 23 Sept: all 32 imported tickets were resolved, the last one on 8 Aug, and nobody is
-- using it. They were bug reports about Pintu, not FSOS workflow. The rows still exist
-- untouched in the old snoboard project (lzeinlserdexophlmqsh) if they're ever wanted.
--
-- Run this in the Supabase SQL editor for project huyylvmlwpphuolpckxw.

alter table notifications drop constraint if exists notifications_ticket_fk;
alter table notifications drop column if exists ticket_id;
drop table if exists tickets;
