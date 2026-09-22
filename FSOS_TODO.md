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

- [ ] 🧑 **Confirm which old database is production.** The backend `.env` uses `lzeinlserdexophlmqsh`, which has the real data. The Cloud Run frontend Dockerfile points at `fxsfhooszmzpmwcaclsd`. Open both dashboards and check which one has recent tickets or 6-Day entries. The import only reads from `lzei…`.
- [ ] 🤖 Re-run the export so the import includes anything added in snoboard since 22 Sept:
      `python supabase/import/export_from_snoboard.py`, then rebuild `out/run_in_supabase.sql`.
- [ ] 🤖 Start the dev server from `fsos-frontend/` (`npm start` → http://localhost:3000).

## 1. Load the database

- [ ] 🤖 Copy `supabase/import/out/run_in_supabase.sql` to the clipboard.
- [ ] 🧑 Supabase → project `huyylvmlwpphuolpckxw` → **SQL Editor → New query** → paste → **Run**. It should end in "Success".
- [ ] 🧑 **Table Editor** check. `people` = 25, `ips` = 48, `tickets` = 32, `six_day_entries` = 407 (more if step 0 picked up new data).
- [ ] 🤖 Spot-check with the service key: roles per person, 13 active IPs, the next ticket number continues after the highest imported one (#56 today).

## 2. API keys and environment

- [ ] 🧑 Supabase → **Project Settings → API Keys**. Send the **anon/publishable** key and the **service_role/secret** key.
- [ ] 🤖 Put the service key only in the backend's git-ignored `.env`. Put the URL and anon key in `fsos-frontend/.env.local`.
- [ ] 🤖 Check nothing secret is tracked: `git grep` for key prefixes returns nothing. The repo is **public**.

## 3. Backend

- [ ] 🧑 **Decide where the API lives.** Recommended: a new, small `fsos-backend/` (FastAPI) that talks only to the new database. The alternative is adding routes to snoboard's 6,000-line `main.py`, which still points at the old database.
- [ ] 🤖 Scaffold it: FastAPI + Supabase client (service key), `/api/health`, CORS for localhost and the production domain, Dockerfile.
- [ ] 🤖 Auth middleware. Verify the Supabase login token on every request, find the person by email, and load their roles and access.
- [ ] 🤖 Access checks on the server. Reuse the area rules from `fsos-frontend/src/domain/access.js`, so a "view" user can't write even by calling the API directly.

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
- [ ] 🤖 API: list people, update roles and person access, role-default overrides, add member, remove access.
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
