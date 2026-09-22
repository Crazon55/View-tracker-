# FSOS — Frontseat Creative Operations Workspace (Product Demo)

## Original problem statement
Build a polished, working, desktop-first product demo of FSOS for Frontseat, a media team operating
multiple Instagram IPs/pages. Every idea must have a visible journey: creation → production → approval →
calendar placement → publication → performance. Two editorial streams (BO = Blue Ocean, batch-researched;
HPN = Happenings, fast/collaborative) share one connected system. Founder understands the whole network
without inspecting every post. (Full 15-section brief supplied by user as source of truth.)

## Architecture
- **Frontend-only** React demo. No backend logic used; FastAPI/Mongo template left untouched.
- **Persistence:** browser localStorage (`fsos_db_v1`). Survives refresh. "Reset demo" regenerates seed.
- **Central domain/state layer** (single source of truth — no per-screen mock arrays):
  - `src/domain/constants.js` — streams, formats, statuses, roles, nav, thresholds
  - `src/domain/dates.js` — IST-aware date helpers (all dates YYYY-MM-DD IST)
  - `src/domain/seed.js` — deterministic seed: 8 IPs (exact spec names/cadence), 9 users, categories,
    4 BO batches, ~50 ideas incl. 30 days of historical publications + snapshots for six-day cycles,
    future placements, unallocated stock, one collaboration, bypass, changes-requested, missing/zero/late metrics
  - `src/domain/store.js` — DemoProvider (React context) + all mutation actions, localStorage sync
  - `src/domain/selectors.js` — derived: idea progress/state, bank health, stock days, network status,
    six-day cycles, performance classification + recent baseline, capture tasks, yesterday cohort, My Work
- **UI:** `components/shell` (sidebar+topbar+role switcher+demo clock), `components/common` (badges, idea list,
  page headers), `components/idea` (IdeaCard modal w/ 6 tabs, CreateIdeaDialog, UIProvider), `components/distribution`
  (BulkPlacement). Pages: CommandRoom, BOStudio, HPNDesk, Production, Distribution, Performance, Settings, Help.

## User personas / roles (configurable)
Founder/Admin, Short-form Lead, CS, COA, Designer, Editor, COC. Users hold multiple roles + stream membership.

## Core requirements (static)
- BO/HPN separate workspaces, shared idea card & records. One production owner per idea (never split versions).
- COC controls the calendar; app never auto-allocates. Repetition rule = calendar-day separation w/ exceptions.
- Cadence seeded exactly; BO quotas intentionally unconfigured ("Not configured", no fake coverage).
- 24h-only performance capture; missing≠zero; late captures show true age; six-day publication cohorts.
- Configurable IPs/users/categories/thresholds without code; new IP appears everywhere w/o fabricated history.

## Implemented (2026-06 — v1 broad core spine)
- Command Room: today posting status, yesterday cohort, six-day cycle chart, bank health & horizon, production issues.
- BO Studio / HPN Desk: batch cards, filterable idea lists, create idea, HPN quick-record drawer + bypass display.
- Idea Card modal: Brief (slides add/remove/reorder, anchored comments), Page Versions (hook/caption/links,
  submit/approve/request-changes/replace), Production & Review (assign one owner/deadline/reviewer, request review),
  Distribution (place/publish), Performance (per-version views + tier), Activity (comments+history).
- Production: stage board, task table w/ bulk assign preview, people workload, My Work.
- Distribution: Bank (filters, unallocated), Idea Matrix (sticky, cell states, side panel), Network Calendar
  (10-day, floors vs planned, HPN reserve, bank drawer placement), Today (per-format floors, execution list,
  record live/link-pending), Bulk placement (select→rotation→preview conflicts→confirm).
- Performance: Capture (overdue/due/soon/completed inline entry), Ideas (per-destination + baseline), IP Cycles.
- Settings: IPs (add/edit floors, BO quotas, targets, pause), People (add, roles, deactivate), Categories, Rules
  (approver delegation, thresholds, baseline sample, cycle anchor, optional spacing).
- Help walkthrough (14 acceptance steps). Demo clock chip + Reset demo.

## Backlog / remaining (P1/P2)
- P1: authorised repetition-exception UI + collaboration linkage UI in Today; HPN→BO displacement replacement dialog;
  scale seed to full ~100 ideas; advance-day/time controls.
- P2: keyboard drag-and-drop on calendar; deeper revision diff view; virtualization for very large sets;
  per-IP individual calendar week view; spacing-cluster review prompt surfacing.

## Next tasks
Run interaction testing; address any blocking issues; then optionally scale seed + add displacement/exception UIs.
