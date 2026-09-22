# FSOS frontend

FSOS (Frontseat OS) is the new frontend that will replace `snoboard-frontend-feature-frontseat`.
It is developed on the `fsos` branch. `main` keeps deploying snoboard until cutover.

## Rolling back

The last snoboard-only version is kept in two places:

- tag `snoboard-before-fsos`
- branch `legacy/snoboard`

Both point at `84da71a`. To go back after cutover, redeploy from `legacy/snoboard`.

## Running it

```bash
cd fsos-frontend
npm ci
npm start        # http://localhost:3000
```

Optional `fsos-frontend/.env.local` (git-ignored). This file turns on the live News Feed:

```
REACT_APP_SUPABASE_URL=https://<project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon key>
```

## What is live and what is still demo data

| Area | Data source today |
|---|---|
| News Feed | Live: Supabase `news_articles` (filled daily by `supabase/functions/fetch-news`) plus Inshorts through the dev proxy (`src/setupProxy.js`). Falls back to demo stories. |
| Everything else | Demo: browser `localStorage` (`fsos_db_v1`), seeded by `src/domain/seed.js` and `src/domain/seedTools.js`. Use the ↻ button next to the demo clock to reseed. |

All state changes go through the action layer in `src/domain/store.js`. That is the seam where the
backend gets connected: each action becomes a call to `snoboard-backend-…` instead of a local update.

## Migration plan

1. **Schema.** Add migration files in `migrations/` for FSOS-only tables: ideas, versions,
   placements, publications, view snapshots, batches, categories, comments and activity.
   Changes are add-only: existing snoboard tables are not altered while snoboard is live.
2. **Backend.** Add FastAPI routes to `snoboard-backend-…/app/main.py` for those tables.
   Reuse the existing routes for pages, user roles and access, the 6-Day tracker, growth,
   tickets and news.
3. **Frontend.** Switch `store.js` actions to the API one area at a time. Add Supabase login
   like snoboard's `AuthContext`.
4. **Cutover.** Point `deploy.sh` and the frontend Dockerfile at `fsos-frontend/`, then merge `fsos` into `main`.

Product background is in `docs/PRD.md`.
