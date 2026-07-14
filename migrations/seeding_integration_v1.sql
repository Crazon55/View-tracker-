-- ─────────────────────────────────────────────────────────────────────────────
-- seeding_integration_v1.sql
-- Brings FS-Seeding (brand-deal / seeding ops) into the FSOS Supabase.
-- Idempotent — safe to re-run. Apply once Supabase incident clears.
--
-- Design decisions (see SEEDING_INTEGRATION_PLAN.md):
--   * All seeding tables are namespaced with a `seeding_` prefix so they never
--     collide with tracker tables (deals / payments / files are generic names).
--   * users overlap → NO parallel login table. `seeding_profiles` is a thin
--     identity anchor synced from Supabase auth (user_id = auth uid). Login stays
--     with Supabase auth; global role authority stays with public.user_roles
--     (comma-separated multi-role — 'bd','fulfillment','seeding_admin' get added
--     there on Day 3). A denormalised `role` column is kept on seeding_profiles as
--     a synced cache so the ported backend keeps working during the auth cutover.
--   * user_sessions → cookie sessions are replaced by Supabase JWT. The table is
--     kept (namespaced) for a safe transition window; unused after the Day-2 auth
--     refactor and can be dropped later.
--   * monetisable_pages overlap → `seeding_monetisable_pages` keeps its own TEXT
--     page_id (FS deliverables FK to it) but links to the canonical tracked page
--     via fsos_page_id → public.pages(id), and is seeded from public.pages. This
--     is the Pages ↔ Deals cross-link (see project_cross_system_sync).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Teams ────────────────────────────────────────────────────────────────────
create table if not exists public.seeding_business_teams (
    team_id     text primary key,
    team_name   text not null,
    created_at  timestamptz not null default now()
);

-- ── Identity anchor (synced from Supabase auth; NOT a login store) ────────────
create table if not exists public.seeding_profiles (
    user_id           text primary key,                 -- = Supabase auth uid
    email             text not null unique,
    name              text not null default '',
    picture           text,
    role              text not null default 'pending',  -- synced cache of user_roles
    business_team_id  text references public.seeding_business_teams(team_id),
    active            boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- ── Transitional session table (deprecated after Day-2 JWT cutover) ───────────
create table if not exists public.seeding_user_sessions (
    session_token  text primary key,
    user_id        text not null references public.seeding_profiles(user_id) on delete cascade,
    expires_at     timestamptz not null,
    created_at     timestamptz not null default now()
);
create index if not exists idx_seeding_sessions_user_id on public.seeding_user_sessions(user_id);

-- ── Monetisable pages (linked to canonical tracker pages) ─────────────────────
create table if not exists public.seeding_monetisable_pages (
    page_id       text primary key,
    page_name     text not null,
    fsos_page_id  uuid references public.pages(id) on delete set null,  -- cross-link
    active        boolean not null default true,
    notes         text not null default '',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists idx_seeding_pages_fsos on public.seeding_monetisable_pages(fsos_page_id);

-- Seed from the canonical tracked pages (id copied as text so FS page_id FKs work).
insert into public.seeding_monetisable_pages (page_id, page_name, fsos_page_id)
select p.id::text, coalesce(p.name, p.handle), p.id
from public.pages p
on conflict (page_id) do nothing;

-- ── Deals ────────────────────────────────────────────────────────────────────
create table if not exists public.seeding_deals (
    deal_id                    text primary key,
    brand_name                 text not null,
    agency_or_client_name      text not null default '',
    brief_text                 text not null default '',
    brief_link                 text not null default '',
    assets_or_reference_links  jsonb not null default '[]'::jsonb,
    price_closed_at            double precision not null default 0,
    payment_due_date           text not null default '',
    go_live_date_time          text not null default '',
    submitted_by_user_id       text references public.seeding_profiles(user_id),
    submitted_by_team_id       text references public.seeding_business_teams(team_id),
    admin_review_status        text not null default 'Submitted',
    deal_status                text,
    rejection_reason           text not null default '',
    needs_more_info_comment    text not null default '',
    approved_by_admin_id       text references public.seeding_profiles(user_id),
    approved_at                timestamptz,
    notes                      text not null default '',
    created_at                 timestamptz not null default now(),
    updated_at                 timestamptz not null default now()
);
create index if not exists idx_seeding_deals_team          on public.seeding_deals(submitted_by_team_id);
create index if not exists idx_seeding_deals_review_status on public.seeding_deals(admin_review_status);
create index if not exists idx_seeding_deals_created_at    on public.seeding_deals(created_at);

-- ── Deliverables ─────────────────────────────────────────────────────────────
create table if not exists public.seeding_deliverables (
    deliverable_id                text primary key,
    deal_id                       text not null references public.seeding_deals(deal_id) on delete cascade,
    page_id                       text not null,
    page_name                     text not null,
    deliverable_type              text not null,
    go_live_date_time             text not null default '',
    status                        text not null default 'Not Started',
    assigned_fulfillment_user_id  text references public.seeding_profiles(user_id),
    live_link                     text not null default '',
    views                         integer not null default 0,
    notes                         text not null default '',
    created_at                    timestamptz not null default now(),
    updated_at                    timestamptz not null default now()
);
create index if not exists idx_seeding_deliverables_deal_id on public.seeding_deliverables(deal_id);

-- ── Fulfillment outputs ──────────────────────────────────────────────────────
create table if not exists public.seeding_fulfillment_outputs (
    output_id        text primary key,
    deal_id          text not null references public.seeding_deals(deal_id) on delete cascade,
    deliverable_id   text,
    output_type      text not null,
    title            text not null,
    writeup_text     text not null default '',
    link             text not null default '',
    file_attachment  text not null default '',
    visible_to_bd    boolean not null default true,
    status           text not null default 'Draft',
    created_by       text references public.seeding_profiles(user_id),
    created_by_name  text,
    created_by_role  text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists idx_seeding_outputs_deal_id on public.seeding_fulfillment_outputs(deal_id);

-- ── Internal notes ───────────────────────────────────────────────────────────
create table if not exists public.seeding_internal_notes (
    note_id         text primary key,
    deal_id         text not null references public.seeding_deals(deal_id) on delete cascade,
    deliverable_id  text,
    note_text       text not null,
    created_by      text references public.seeding_profiles(user_id),
    created_by_name text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_seeding_notes_deal_id on public.seeding_internal_notes(deal_id);

-- ── Client feedback ──────────────────────────────────────────────────────────
create table if not exists public.seeding_client_feedback (
    feedback_id       text primary key,
    deal_id           text not null references public.seeding_deals(deal_id) on delete cascade,
    deliverable_id    text,
    output_id         text,
    feedback_text     text not null,
    image_attachment  text not null default '',
    file_attachment   text not null default '',
    reference_link    text not null default '',
    status            text not null default 'Open',
    added_by_user_id  text references public.seeding_profiles(user_id),
    added_by_name     text,
    added_by_role     text,
    added_by_team     text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_seeding_feedback_deal_id   on public.seeding_client_feedback(deal_id);
create index if not exists idx_seeding_feedback_output_id on public.seeding_client_feedback(output_id);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table if not exists public.seeding_payments (
    payment_id           text primary key,
    deal_id              text not null unique references public.seeding_deals(deal_id) on delete cascade,
    status               text not null default 'Not Raised',
    payment_due_date     text not null default '',
    amount_received      double precision not null default 0,
    payment_notes        text not null default '',
    last_updated_by      text references public.seeding_profiles(user_id),
    last_updated_by_name text,
    last_updated_at      timestamptz not null default now()
);
create index if not exists idx_seeding_payments_deal_id on public.seeding_payments(deal_id);

-- ── Files ────────────────────────────────────────────────────────────────────
create table if not exists public.seeding_files (
    file_id            text primary key,
    storage_path       text not null,
    original_filename  text,
    content_type       text,
    size               bigint not null default 0,
    uploaded_by        text references public.seeding_profiles(user_id),
    is_deleted         boolean not null default false,
    created_at         timestamptz not null default now()
);

-- ── Storage bucket for seeding uploads ───────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('seeding-uploads', 'seeding-uploads', false)
on conflict (id) do nothing;
