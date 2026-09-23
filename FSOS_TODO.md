# FSOS go-live checklist

FSOS replaces the snoboard frontend. We work on the `fsos` branch. `main` keeps deploying snoboard until the final step.
Tick items off as they're done (`[x]`). **Owner:** 🧑 you (needs the Supabase dashboard or a decision) · 🤖 Claude.

**Where things are**

| Thing | Location |
|---|---|
| FSOS app | `fsos-frontend/` |
| Database schema | `supabase/migrations/` |
| Old → new data import | `supabase/import/export_from_snoboard.py` → `supabase/import/out/` (git-ignored, contains emails) |
| New FSOS database | Supabase project `huyylvmlwpphuolpckxw` |
| Old snoboard database | Supabase project `lzeinlserdexophlmqsh` |
| Rollback | branch `legacy/snoboard`, tag `snoboard-before-fsos` |

---

## 0. Before we start

- [x] 🧑 **Confirm which old database is production.** Answered 23 Sept: View-tracker uses **both**. `lzeinlserdexophlmqsh` holds all the data (people, pages, tickets, 6-Day) and is what the import reads; `fxsfhooszmzpmwcaclsd` has no data tables and is used **only for Google login**. FSOS gets its own login on the new project, and people are matched by email.
- [x] 🤖 Re-run the export so the import includes anything added in snoboard since 22 Sept:
      `python supabase/import/export_from_snoboard.py`, then rebuild `out/run_in_supabase.sql`.
- [x] 🤖 Start the dev server from `fsos-frontend/` (`npm start` → http://localhost:3000).

## 1. Load the database

- [x] 🤖 Copy the setup SQL to the clipboard. (23 Sept: the schema had already been run, so `out/run_remaining.sql` — migration 2 + data — was used instead.)
- [x] 🧑 Supabase → project `huyylvmlwpphuolpckxw` → **SQL Editor → New query** → paste → **Run**. Done 23 Sept: finished with `setval 55`, the last statement, so the import completed.
- [ ] 🧑 **Table Editor** check. `people` = 25, `ips` = 48, `tickets` = 32, `six_day_entries` = 407 (more if step 0 picked up new data).
- [x] 🤖 Spot-check with the service key. 23 Sept: 25 people (CS 6, Editor 5, Designer 3, COC 2, COA 2, COA+Founder/Admin 1, Short-form Lead 1, 5 pending), 48 IPs / 13 active, 407 six-day entries, 249 top content, 44 growth rows, 32 tickets with #55 the highest, 5 imported person overrides.

## 2. API keys and environment

- [x] 🧑 Supabase → **Project Settings → API Keys**. Done 23 Sept.
- [x] 🤖 Service key in `fsos-backend/.env`; URL + anon key in `fsos-frontend/.env.local`. The News Feed keeps reading the old project (`REACT_APP_NEWS_SUPABASE_*`) until step 5e.
- [x] 🤖 Checked: both files are git-ignored and no key is staged.

## 3. Backend

- [x] 🧑 **Where the API lives:** a new `fsos-backend/` (FastAPI), talking only to the new database. Say so if you'd rather it lived in the snoboard backend.
- [x] 🤖 Scaffolded: FastAPI + PostgREST client (service key), `/api/health`, `/api/me`, CORS. Dockerfile still to do (step 7).
- [x] 🤖 Auth: the session token is verified with Supabase, the person is matched by email (new emails become pending), roles and access resolved. `FSOS_DEV_LOGIN` allows a dev header locally until Google sign-in exists.
- [x] 🤖 Server-side access checks in `app/access.py` (mirrors the frontend rules); every route calls `require(...)`. 39 API tests pass.
- [x] 🤖 No privilege escalation: you can't grant access above your own, only a Founder/Admin grants that role, and the last one can't be removed. Before this any COA could have promoted themselves.

## 4. Login

- [ ] 🧑 Supabase → **Authentication → Providers → Google**. Turn it on with the Google OAuth client (the same one snoboard uses, or a new one). Add the redirect URLs for localhost:3000 and the production domain.
- [ ] 🤖 Login page in FSOS, restricted to `@owledmedia.com`.
- [ ] 🤖 On first login, link the Supabase user to their `people` row by email (`people.auth_user_id`).
- [ ] 🤖 Someone who logs in but isn't in `people` gets a new row with no role and sees "pending access".
- [ ] 🤖 Replace the demo "act as" switcher with the logged-in user plus a sign-out button. Keep **Preview as role** for admins.
- [ ] 🧑 Test: log in as yourself, check your role and sidebar, then log out.

## 5. Connect the 6 added features to real data

Each item ends with "works in the browser against the new database", checked by both of us.

### 5a. Users & Roles
- [x] 🤖 API: list people, update roles and person access, role-default overrides, add member, remove access. Self-lockout and Founder/Admin are protected.
- [ ] 🤖 Frontend: hide actions the API would refuse (granting above your own access, the Founder/Admin role for non-founders) so nobody meets a dead button.
- [ ] 🤖 Frontend: Users & Roles page and sidebar gating read from the API.
- [ ] 🧑 Check: all 25 people show with the right roles. Changing someone's access changes their sidebar after they reload.

### 5b. Tickets
- [ ] 🤖 API: list, create, update (status, assignee, title, description), delete. Notifications for @mentions, assignment and status changes.
- [ ] 🤖 Attachments: switch from in-browser images to Cloudinary signed uploads (reuse snoboard's `cloudinary_sign.py`). Needs the Cloudinary keys in the backend `.env`.
- [ ] 🤖 Frontend: Tickets page, sidebar badge and bell notifications read from the API.
- [ ] 🧑 Check: the 32 old tickets appear. A new ticket gets the next number. Take and finish both work. The person you mention sees a notification.

### 5c. 6-Day Tracker
- [ ] 🤖 API: month view (cycles, entries, topline), upsert an entry, topline add/edit/delete, month-end actuals, 6-Day assignee setting.
- [ ] 🤖 Frontend: the page reads and writes through the API. Overdue alerts go to the assignee.
- [ ] 🧑 Check: April–September history matches snoboard. Editing a number and reloading keeps it.

### 5d. Growth
- [ ] 🤖 API: monthly rows per IP. 6-Day cycle sums win; `growth_monthly` fills the months before the 6-Day Tracker existed.
- [ ] 🤖 Frontend: Growth reads the API; followers are editable for Edit users.
- [ ] 🧑 Check: monthly totals match snoboard's Growth page for the same months.

### 5e. News Feed
- [ ] 🤖 Deploy `supabase/functions/fetch-news` to the new project (Supabase CLI: `supabase functions deploy fetch-news --project-ref huyylvmlwpphuolpckxw`).
- [ ] 🧑 Schedule it daily: Supabase → **Integrations → Cron**, or the same scheduler that runs it on the old project.
- [ ] 🤖 API: articles (last 2 days), votes, learned rules, saved. Inshorts goes through the backend instead of the dev-only proxy, so it works when deployed.
- [ ] 🤖 Frontend: News Feed uses the API. Remove the direct Supabase calls and `setupProxy.js`.
- [ ] 🧑 Check: today's stories show. The next morning there are new stories without anyone clicking anything.

### 5f. Pintu
- [ ] 🤖 Nothing to connect (it's an external link). Confirm it's gated by the real access matrix after login.
- [ ] 🧑 Confirm the URL `http://16.112.125.207:5173/` is still correct.

## 6. The core FSOS workflow (after the 6 features)

These screens have no data in the old database, so they start empty on the real database.

- [ ] 🤖 IPs, categories and settings via the API (Settings page).
- [ ] 🤖 Ideas and versions: create, edit brief, destinations, approval, BO batches (BO Studio, HPN Desk, Idea Card).
- [ ] 🤖 Production: assign owner, deadline and reviewer, links, submit, approve, request changes.
- [ ] 🤖 Distribution: placements, bulk placement, same-day exception, HPN displacement, confirm publication.
- [ ] 🤖 Performance: 24-hour view capture, baselines, cycles. Command Room summaries.
- [ ] 🤖 Comments, activity log and notifications.
- [ ] 🤖 Turn off the demo store for signed-in users. Keep it available only as an explicit demo mode, if wanted.

## 7. Go-live

- [ ] 🤖 Production build of `fsos-frontend` in Docker (nginx, like snoboard's Dockerfile) with the new env vars.
- [ ] 🤖 Update `deploy.sh` to build `fsos-frontend/` and the FSOS backend instead of the snoboard folders.
- [ ] 🧑 Pick a cutover time when nobody is mid-task in snoboard.
- [ ] 🤖 Cutover day: re-run the export and import (it's safe to re-run) so the latest snoboard data comes across.
- [ ] 🧑 Final check with 2–3 teammates (a CS, an Editor, a COC) on the deployed build.
- [ ] 🧑 Approve the merge of `fsos` → `main`. That's the pull request GitHub keeps suggesting.
- [ ] 🤖 Deploy, then watch errors for the first day.

## Rollback (if something goes wrong after go-live)

1. Redeploy from branch `legacy/snoboard` (or tag `snoboard-before-fsos`). The old app and old database are untouched, so it comes back as it was.
2. Anything entered in FSOS after cutover stays in the new database. Nothing is lost; it just isn't visible in snoboard.
