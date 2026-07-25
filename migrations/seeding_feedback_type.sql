-- Add feedback_type for deliverable chat kinds: blocker | comment | change
-- Idempotent — safe to re-run.

alter table public.seeding_client_feedback
  add column if not exists feedback_type text not null default 'comment';

update public.seeding_client_feedback
set feedback_type = 'comment'
where feedback_type is null
   or feedback_type not in ('blocker', 'comment', 'change');

create index if not exists idx_seeding_feedback_deliverable_id
  on public.seeding_client_feedback(deliverable_id);

create index if not exists idx_seeding_feedback_type
  on public.seeding_client_feedback(feedback_type);
