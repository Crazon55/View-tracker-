# FSOS backend

The API behind `fsos-frontend/`. Talks only to the **FSOS** Supabase project
(`huyylvmlwpphuolpckxw`). The snoboard backend is untouched and still serves the live
snoboard app from the old project.

## Running it

```bash
cd fsos-backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Settings come from `fsos-backend/.env` (git-ignored — it holds the service key):

```
FSOS_SUPABASE_URL=https://<project>.supabase.co
FSOS_SUPABASE_SERVICE_KEY=<service_role key>   # bypasses RLS; server only, never the browser
FSOS_SUPABASE_ANON_KEY=<anon key>
FSOS_CORS_ORIGINS=http://localhost:3000
FSOS_ALLOWED_EMAIL_DOMAIN=owledmedia.com
FSOS_DEV_LOGIN=true                            # local only — see below
```

## How access works

Every table has row-level security on with no public policies, so the browser key can read
nothing. All access goes through this API, which uses the service key and checks each request:

1. The browser sends its Supabase session token; we ask Supabase who it belongs to.
2. That email is matched to a row in `people` (creating a pending one if they're new).
3. Their roles and any overrides resolve to an access matrix — the same rules as
   `fsos-frontend/src/domain/access.js`. **Keep `app/access.py` in sync with it.**
4. Each route calls `require(matrix, area, "view"|"edit")`.

`FSOS_DEV_LOGIN=true` additionally accepts `X-FSOS-Dev-Email: someone@owledmedia.com`
instead of a real token, so the API can be exercised before Google sign-in is wired up.
**Never enable it on a deployed instance** — it would let anyone act as anyone.

## Tests

With the server running and `FSOS_DEV_LOGIN=true`:

```bash
python fsos-backend/tests/test_people_api.py
```

It runs against the real project and undoes every change it makes.

## Endpoints so far

| Method | Path | Needs |
|---|---|---|
| GET | `/api/health` | — |
| GET | `/api/me` | signed in |
| GET | `/api/people` | users_roles: view |
| POST | `/api/people` | users_roles: edit |
| PATCH | `/api/people/{id}` | users_roles: edit |
| DELETE | `/api/people/{id}/access` | users_roles: edit |
| GET | `/api/roles/access` | users_roles: view |
| PUT | `/api/roles/access` | users_roles: edit |
| DELETE | `/api/roles/access?role=…` | users_roles: edit |

Roles travel in the body or query string, never the path: `Founder/Admin` contains a slash.
