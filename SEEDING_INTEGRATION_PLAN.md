# FS-Seeding → FSOS (View Tracker) Integration Plan

**Decision:** Full native merge · Fully unified DB + login · **UI redo of Seeding pages (evolve FSOS look)**
**Estimate:** 11–15 working days
**Status:** Ideation locked, implementation not started

---

## The two apps

| | FSOS (View Tracker) | FS-Seeding |
|---|---|---|
| Build | Vite + React 18 | CRA + React 19 |
| Router | react-router 6 | react-router 7 |
| UI | Radix/shadcn + Tailwind | Radix/shadcn + Tailwind (**same**) |
| Data | Supabase | Supabase (**same**) |
| Backend | FastAPI, supabase-py, `app/main.py` (5,524 ln) | FastAPI, raw asyncpg, `server.py` (1,545 ln, 36 endpoints) |
| Auth | Supabase auth + `user_roles(email, role)` | Own `users` table, 4 roles, impersonation |
| RBAC | Mature — 15+ roles, `permissions.ts`, `isRouteAllowed` | `pending / admin / bd / fulfillment` |

**Why favorable:** same UI lib, same Supabase, same FastAPI. Work is in the seams, not rewrites.

## Feature surface coming in (12 pages)
Overview · Approval Queue · Create/Submit Brief · All Deals · Teamwise Deals · Fulfillment Board · Users & Roles · Monetisable Pages · Deal Detail
Tables (11): business_teams, users, user_sessions, monetisable_pages, deals, deliverables, fulfillment_outputs, internal_notes, client_feedback, payments, files

## Two overlaps to resolve (Day 1 crux)
1. **users** — fold FS `users` (user_id, role, business_team_id, active) into FSOS Supabase auth + `user_roles`. No parallel user table.
2. **monetisable_pages ↔ pages** — same concept (IG accounts). Map FS `page_id TEXT` → FSOS `pages.id UUID`/`handle`. Enables Pages↔Deals cross-linking.

---

## Day-by-day

**Day 1 — Data model & overlap resolution**
- Reconcile `users` → auth + `user_roles`; map `monetisable_pages` → `pages`.
- Write one consolidated migration; namespace FS tables (`deals`, `deliverables`, `payments`, `fulfillment_outputs`, `internal_notes`, `client_feedback`, `files`, `business_teams`).
- Decide backend: mount `server.py` as a FastAPI router under existing app (recommended) vs. sibling service.

**Day 2 — Backend merge**
- Bring 36 endpoints under FSOS FastAPI. Swap FS asyncpg-JWT for FSOS Supabase session/JWT.
- Unify impersonation (FS `X-Impersonate-As`) with FSOS "Preview as…".

**Day 3 — RBAC reconciliation (highest risk)**
- Add `bd` + `fulfillment` + seeding permissions to `permissions.ts`; add route guards + `isRouteAllowed` entries for `/seeding/*`.
- Fulfillment price/payment field-stripping preserved. Ties to project_rbac_planning.

**Days 4–6 — Frontend port**
- Move 12 pages into Vite `src/pages/Seeding/`. Fix router 7→6 API + React 19-isms.
- Wire to merged API; dedupe shared shadcn components; drop FS node_modules.

**Day 7 — Shell + preview merge**
- Add "Seeding" section to FSOS sidebar. Merge FS RoleHome into FSOS routing. One "Preview as…".

**Days 8–11 — UI redo of the 12 Seeding pages (evolve FSOS look)**
- Day 8 — Foundation: point Seeding's shadcn components at FSOS `index.css` tokens (both use HSL-var shadcn, so primitives inherit for free). Kill FS's flat-admin styles. Set page shell (spacious full-width, Inter/Outfit).
- Day 9 — Overview + dashboards: rebuild Overview as FSOS card-grid (like Ecosystem Reach / Monthly Growth), shared recharts theme, KPI tiles.
- Day 10 — Data-heavy pages: All Deals, Teamwise Deals, Fulfillment Board, Approval Queue — full-page tables (spacious-layouts rule), FSOS status badges, filters.
- Day 11 — Forms + detail: Create/Submit Brief, Deal Detail, Users & Roles, Monetisable Pages — FSOS inputs, dialogs, empty states, micro-interactions (framer-motion).

**Days 12–14 — QA across every role, migration dry-run, fixes**

**Day 15 — Buffer / deploy**

> Scope note: UI redo is **Seeding pages only** — FSOS pages untouched. Direction = evolve current FSOS (no new design system, no Figma pass required). Because both apps use shadcn HSL tokens, the reskin is mostly variable-inheritance + bespoke-layout rebuilds.

---

## New UI/UX after merge (Seeding pages redesigned, evolving FSOS)
FSOS tokens the redo consumes: `--background 0 0% 2%` · `--card 0 0% 4.5%` · `--primary 155 100% 50%` (green) · `--accent 192 100% 50%` (cyan) · `--radius 0.75rem` · Inter/Outfit/JetBrains Mono.
- **One shell:** Seeding = top-level FSOS sidebar section, inherits the dark cinematic card style (not flat FS look). Dense tables get full-page width (spacious-layouts rule).
- **Overview → FSOS dashboard card grid** matching Ecosystem Reach / Monthly Growth panels; shared recharts theme; KPI tiles restyled.
- **Data pages** (Deals, Teamwise, Fulfillment, Approvals) rebuilt as spacious full-width tables with FSOS status badges + filters.
- **Forms/detail** (Brief, Deal Detail, Users & Roles, Pages) use FSOS inputs/dialogs/empty-states + framer-motion micro-interactions.
- **One identity:** FS "Seeding ops" role dropdown disappears into FSOS RBAC + "Preview as…". BD sees Seeding section; admin sees all.
- **Cross-links:** Monetisable Pages ↔ FSOS Pages/IP; Deals ↔ postings (cross-system sync).

## Risk register
1. RBAC merge (Day 3) — make-or-break. 2. users/auth unification. 3. React 19→18 + router downgrade edge cases. 4. Migration on live data (dry-run Day 9).
