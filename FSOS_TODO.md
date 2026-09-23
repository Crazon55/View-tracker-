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

## Where we are (23 Sept, evening)

Steps 0–5 done, and step 6 with them. **The demo store is gone** — the app loads and
saves everything through the API against the new database. **Google sign-in works**, proved
end to end on localhost.

**Next up:** the cutover. snoboard is already stopped on the EC2 box, so the domain is
down until `./deploy-fsos-pm2.sh` runs there. That script is the whole deploy: venv +
uvicorn under pm2 on 127.0.0.1:8000, a production build published to `/var/www/fsos`,
and nginx serving it with `/api` proxied on the same origin.

**Before running it on the box**, two files have to exist there — neither is in git:
`fsos-backend/.env` (service key, `FSOS_DEV_LOGIN` absent or false,
`FSOS_ALLOWED_EMAIL_DOMAIN=owledmedia.com`, `FSOS_CORS_ORIGINS=https://thefrontseatmedia.com`)
and `fsos-frontend/.env.local` (Supabase URL + anon key, no dev email). The script
refuses to run without them rather than shipping an app nobody can sign into.

**Rollback:** the script saves the vhost it replaces to `/etc/nginx/frontseat.conf.pre-fsos`.
Restoring that file and reloading nginx puts snoboard's vhost back; its code is still on disk.

Running locally: `fsos-frontend` on :3000 (`npx craco start`), `fsos-backend` on :8000
(`python -m uvicorn app.main:app --port 8000`, with `FSOS_DEV_LOGIN=true`).
Tests: `CI=true npx craco test --watchAll=false` (44), `python fsos-backend/tests/test_people_api.py` (39),
`python fsos-backend/tests/test_workflow_api.py` (108). Run the two API suites one at a
time — they both write to the real project and tidy up after themselves.

---

## 0. Before we start

- [x] 🧑 **Confirm which old database is production.** Answered 23 Sept: View-tracker uses **both**. `lzeinlserdexophlmqsh` holds all the data (people, pages, tickets, 6-Day) and is what the import reads; `fxsfhooszmzpmwcaclsd` has no data tables and is used **only for Google login**. FSOS gets its own login on the new project, and people are matched by email.
- [x] 🤖 Re-run the export so the import includes anything added in snoboard since 22 Sept:
      `python supabase/import/export_from_snoboard.py`, then rebuild `out/run_in_supabase.sql`.
- [x] 🤖 Start the dev server from `fsos-frontend/` (`npm start` → http://localhost:3000).

## 1. Load the database

- [x] 🤖 Copy the setup SQL to the clipboard. (23 Sept: the schema had already been run, so `out/run_remaining.sql` — migration 2 + data — was used instead.)
- [x] 🧑 Supabase → project `huyylvmlwpphuolpckxw` → **SQL Editor → New query** → paste → **Run**. Done 23 Sept: finished with `setval 55`, the last statement, so the import completed.
- [x] 🤖 **Row counts checked 23 Sept.** With data: `people` 26, `ips` 48, `six_day_entries` 407, `six_day_top_content` 249, `growth_monthly` 44, `access_person_overrides` 5, `news_feedback` 5, `news_saved` 3, `app_settings` 1. The other 14 tables are empty because they belong to step 6.
- [x] 🧑 **Drop-tickets SQL run 23 Sept.** Verified: `tickets` gone (404), `notifications.ticket_id` and its foreign key gone, everything else intact, 39 API tests still pass. 23 tables left. The 32 rows remain in the old project.
- [ ] 🧑 **Decide on `krishna@owledmedia.com`** — a pending row with no roles, created 23 Sept by a wrong-email API test of mine (the real one is `krishna.koushik@`). Harmless; delete it or leave it.
- [x] 🤖 Spot-check with the service key. 23 Sept: 25 people (CS 6, Editor 5, Designer 3, COC 2, COA 2, COA+Founder/Admin 1, Short-form Lead 1, 5 pending), 48 IPs / 13 active, 407 six-day entries, 249 top content, 44 growth rows, 5 imported person overrides.

## 2. API keys and environment

- [x] 🧑 Supabase → **Project Settings → API Keys**. Done 23 Sept.
- [x] 🤖 Service key in `fsos-backend/.env`; URL + anon key in `fsos-frontend/.env.local`, plus `REACT_APP_FSOS_API_URL`. The old project's `REACT_APP_NEWS_SUPABASE_*` are gone — the News Feed goes through the backend now.
- [x] 🤖 Checked: both files are git-ignored and no key is staged.

## 3. Backend

- [x] 🧑 **Where the API lives:** a new `fsos-backend/` (FastAPI), talking only to the new database. Say so if you'd rather it lived in the snoboard backend.
- [x] 🤖 Scaffolded: FastAPI + PostgREST client (service key), `/api/health`, `/api/me`, CORS. Dockerfile still to do (step 7).
- [x] 🤖 Auth: the session token is verified with Supabase, the person is matched by email (new emails become pending), roles and access resolved. `FSOS_DEV_LOGIN` allows a dev header locally until Google sign-in exists.
- [x] 🤖 Server-side access checks in `app/access.py` (mirrors the frontend rules); every route calls `require(...)`. 39 API tests pass.
- [x] 🤖 No privilege escalation: you can't grant access above your own, only a Founder/Admin grants that role, and the last one can't be removed. Before this any COA could have promoted themselves.
- [ ] 🤖 **Test that `app/access.py` and `access.js` can't drift.** They're the same rules written twice; only a comment holds them together today. Worth doing before the feature routers land.
- [x] 🤖 **Refuses to start if `FSOS_DEV_LOGIN` is on with a non-localhost CORS origin** (`app/config.py`). It accepts an email header instead of a token, so it must never run anywhere reachable; a warning in a log nobody reads is how that ships by accident.
- [ ] 🤖 Convert the test script to pytest. Fine at 39 checks, awkward at 300.
- [ ] 🤖 Rate-limit `/api/me` (it hits Supabase auth on every cold token).

## 4. Login

**Done and proved 23 Sept — a real Google sign-in completed end to end on localhost.**

- [x] 🧑 Supabase → **Authentication → Providers → Google**. Turn it on with the Google OAuth client (the same one snoboard uses, or a new one).
      Google Cloud → authorised redirect URI: `https://huyylvmlwpphuolpckxw.supabase.co/auth/v1/callback`.
      Supabase → **Authentication → URL Configuration**: Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/**`.
      Add the production URL there too once we have one.
- [x] 🤖 Login page (`components/auth/SignIn.js`), Google only, `@owledmedia.com` only — `lib/session.js` drives the redirect against Supabase's auth API, no SDK.
- [x] 🤖 First login links the Supabase user to their `people` row by email and stores `auth_user_id` (`app/auth.py`, already there since step 3).
- [x] 🤖 Someone not in `people` gets a row with no roles and sees the pending-access screen (`components/auth/Gate.js`).
- [x] 🤖 The demo "act as" switcher is gone. In its place: an account menu with your name, email and roles, **Preview as role** for admins, and sign out.
- [x] 🧑 **Tested 23 Sept: signed in with Google, landed as Founder/Admin.** That was the first time the whole chain ran — Google client, Supabase callback, person matched by email, roles and access resolved.
- [x] 🧑 Supabase → **URL Configuration**: Site URL `https://thefrontseatmedia.com`; Redirect URLs `http://localhost:3000/**`, `https://thefrontseatmedia.com`, `https://thefrontseatmedia.com/**`.

## 5. Connect the added features to real data

**Tickets was removed on 23 Sept** — all 32 were resolved, the last on 8 Aug, and nobody was using it. They were Pintu bug reports, not FSOS workflow. Cloudinary went with it, so no Cloudinary keys are needed. The code is gone as of `4e3dbc8`; the table itself is dropped by the SQL in step 1.

Each item ends with "works in the browser against the new database", checked by both of us.

### 5a. Users & Roles
- [x] 🤖 API: list people, update roles and person access, role-default overrides, add member, remove access. Self-lockout and Founder/Admin are protected.
- [x] 🤖 API also takes profile edits now (name, streams, skills, active) so Settings → People works. You can't deactivate yourself or the last Founder/Admin.
- [ ] 🤖 Frontend: hide actions the API would refuse (granting above your own access, the Founder/Admin role for non-founders) so nobody meets a dead button. **Still open** — the API refuses correctly, but the button is still there to press.
- [x] 🤖 Frontend: Users & Roles page and sidebar gating read from the API.
- [ ] 🧑 Check: all 26 people show with the right roles. Changing someone's access changes their sidebar after they reload.

### 5b. 6-Day Tracker
- [x] 🤖 API: entries upserted on (month, cycle, IP), top content add/edit/delete, month-end actuals, assignee setting (`app/routers/tools.py`).
- [x] 🤖 Frontend: the page reads and writes through the API. Overdue cycles still surface to the assignee in the bell.
- [ ] 🧑 Check: April–September history matches snoboard. Editing a number and reloading keeps it.

### 5c. Growth
- [x] 🤖 API: `growth_monthly` per IP per month; editing followers leaves the imported `views` alone. Cycle sums still win where 6-Day data exists.
- [x] 🤖 Frontend: Growth reads the workspace; followers are editable for Edit users.
- [ ] 🧑 Check: monthly totals match snoboard's Growth page for the same months.

### 5d. News Feed
**What was actually wrong:** `newsLive.js` pointed at the *new* project but queried
`news_feed_feedback`, `news_feed_saved` and `linkedin_feed` — none of which exist there —
while `news_articles` was empty. The only thing working was the Inshorts scrape, which
never touched Supabase. That's why it looked fine.

**How the stories actually arrive:** an n8n workflow on Hostinger cloud collects them and
POSTs them into Supabase. It was still pointed at the *old* project, which is why
`news_articles` was empty here and the feed showed Inshorts only. The `fetch-news` edge
function is not in the loop and does not need deploying.

- [x] 🤖 `POST /api/news/ingest` takes the stories, authenticated by a shared token. n8n is a machine on someone else's cloud: it gets a token that can add news articles and nothing else, rather than the service-role key, which would let whoever holds it read every table in the project. Accepts a single object, an array, or `{"articles":[…]}`, upserts on `url`, and skips a malformed story rather than rejecting the batch.
- [ ] 🧑 **Set `FSOS_NEWS_INGEST_TOKEN` in `fsos-backend/.env` on the server** (`openssl rand -base64 32`) and redeploy. The route returns 503 until it's set.
- [ ] 🧑 **Repoint the n8n "Save to Supabase" node** at `https://thefrontseatmedia.com/api/news/ingest`, with headers `X-FSOS-Ingest-Token: <that token>` and `Content-Type: application/json`. Remove the `apikey` and `Authorization` headers — it no longer talks to Supabase directly. Body stays `{{ $json }}`.
- [x] 🤖 API: articles (last 2 days), votes, learned rules, saved (`app/routers/news.py`). Inshorts is read server-side, so it works on a deployed build.
- [x] 🤖 Frontend: News Feed uses the API. The direct Supabase calls and `setupProxy.js` are gone. The LinkedIn tab went too — that feed is snoboard's n8n ingest and the team don't need it.
- [ ] 🧑 Check: today's stories show. The next morning there are new stories without anyone clicking anything.

### 5e. Pintu
- [x] 🤖 Nothing to connect (it's an external link); it's gated by the real access matrix like every other area.
- [ ] 🧑 Confirm the URL `http://16.112.125.207:5173/` is still correct.

## 6. The core FSOS workflow

Done. These screens started empty — the old database has nothing like them — and they now
read and write the new one.

- [x] 🤖 IPs, categories and settings via the API. Settings defaults (thresholds, baseline sample, approvers) live in `app/routers/settings.py` and are merged over whatever's stored, so a fresh database is usable on day one and an unset quota still reads "Not configured" rather than a fake zero.
- [x] 🤖 Ideas and versions: create, edit brief, destinations, approval, batches. One version per destination IP; adding a destination creates one, removing a destination keeps it.
- [x] 🤖 Production: one owner per idea (reassignment pushes the old owner onto `previous_owners` rather than overwriting), deadline, reviewer, asset links, submit, approve, request changes. Nothing reaches review without an asset; a rejection always carries a comment.
- [x] 🤖 Distribution: placements, bulk placement, same-day repetition exception (recorded with who and why), HPN displacement that reschedules or returns the BO version but never drops it, publication confirmation.
- [x] 🤖 Performance: 24-hour capture. `views` stays NULL until someone types a number — missing is not zero — and `age_hours` is measured from publication, so a late capture reads as the age it really is.
- [x] 🤖 Comments (anchored to a slide, asset or version), replies, resolve, the activity log, and per-person notifications. `notifyUser()` came back as part of this.
- [x] 🤖 **The demo store is gone.** `domain/seed.js` and `domain/seedTools.js` are deleted, along with `localStorage` persistence, "Reset demo" and the "act as" switcher. `domain/store.js` is now an API-backed workspace; the calendar maths that lived in the seed moved to `domain/sixDay.js`, which is real domain logic, not demo data.
- [ ] 🧑 **Walk through it in the browser** and tell me what feels wrong. It's verified by tests, not by eyes, and those are different things.

**How it's put together.** `GET /api/workspace` returns the whole state in one round trip,
in the shape the UI already held, so the selectors and every screen were left alone.
Mutations write to the database first and only then update what's on screen. The browser
never touches Supabase except to sign in — RLS denies the anon key everything on purpose,
so the backend is the single door.

**Proof it's actually stored.** `python fsos-backend/tests/test_workflow_api.py` — 107
checks. It walks one idea from creation through approval, production, review, the
calendar, publication and a 24-hour capture, then verifies every value three ways: the
mutation's response, three consecutive fresh `GET /api/workspace` calls (what a refresh
does), and a direct PostgREST read that never touches the API. It cleans up after itself;
`--keep` leaves the walkthrough in the app so you can look at it.

## 7. Go-live

- [ ] 🤖 Production build of `fsos-frontend` in Docker (nginx, like snoboard's Dockerfile) with the new env vars. **`REACT_APP_FSOS_DEV_EMAIL` must not be set, and `FSOS_DEV_LOGIN` must be off.**
- [ ] 🤖 Update `deploy.sh` to build `fsos-frontend/` and the FSOS backend instead of the snoboard folders.
- [ ] 🧑 **Decided 23 Sept: one host.** nginx on `thefrontseatmedia.com` serves the built frontend and proxies `/api` to the FSOS backend. So there is no CORS in production, no second certificate, and `REACT_APP_FSOS_API_URL` is left **unset** in the production build — the app calls `/api` on its own origin (`lib/api.js` already defaults that way).
- [ ] 🧑 Supabase → **Authentication → URL Configuration**: Site URL `https://thefrontseatmedia.com`, and keep both `http://localhost:3000/**` and `https://thefrontseatmedia.com/**` in Redirect URLs. The Google Cloud redirect URI does **not** change with the app's domain — it's Supabase's callback.
- [ ] 🧑 Pick a cutover time when nobody is mid-task in snoboard.
- [ ] 🤖 Cutover day: re-run the export and import (it's safe to re-run) so the latest snoboard data comes across.
- [ ] 🧑 Final check with 2–3 teammates (a CS, an Editor, a COC) on the deployed build.
- [ ] 🧑 Approve the merge of `fsos` → `main`. That's the pull request GitHub keeps suggesting.
- [ ] 🤖 Deploy, then watch errors for the first day.

## Rollback (if something goes wrong after go-live)

1. Redeploy from branch `legacy/snoboard` (or tag `snoboard-before-fsos`). The old app and old database are untouched, so it comes back as it was.
2. Anything entered in FSOS after cutover stays in the new database. Nothing is lost; it just isn't visible in snoboard.
