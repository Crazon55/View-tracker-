#!/bin/bash
# NOT the script for the current server. This one needs Docker and Debian-style
# sites-available; the EC2 box runs Amazon Linux with nginx conf.d, pm2 and no Docker.
# Use ./deploy-fsos-pm2.sh there. Kept for a box that does have Docker.
#
# Deploy FSOS to thefrontseatmedia.com (replaces snoboard on this box).
#
#   ./deploy-fsos.sh
#
# Expects, once:
#   - branch `fsos` checked out on the server
#   - fsos-backend/.env present (service key; never committed)
#   - snoboard pm2 stopped (so nothing else owns :80/:443)
#   - deploy/fsos.nginx.conf installed and certbot run — see that file's header
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$REPO_ROOT/fsos-backend"
FRONTEND_DIR="$REPO_ROOT/fsos-frontend"
WEB_ROOT="/var/www/fsos"

branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "fsos" ]; then
  echo "On branch '$branch', expected 'fsos'. Refusing — this script is not the snoboard deploy." >&2
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "Missing $BACKEND_DIR/.env — the API can't reach Supabase without it." >&2
  exit 1
fi

# The frontend needs the Supabase URL and anon key at BUILD time — they get compiled
# into the bundle, and sign-in is the only thing the browser does directly. .env.local
# is git-ignored, so a fresh clone on the server does not have it, and without this
# check the build succeeds and quietly ships an app whose login page says
# "Sign-in isn't configured".
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  cat >&2 <<'MISSING'
Missing fsos-frontend/.env.local — the build would have no Supabase config and nobody
could sign in. Create it on this box with:

  REACT_APP_SUPABASE_URL=https://huyylvmlwpphuolpckxw.supabase.co
  REACT_APP_SUPABASE_ANON_KEY=<the anon key from Supabase → Project Settings → API Keys>

Do not set REACT_APP_FSOS_API_URL there; this script builds with it empty on purpose.
MISSING
  exit 1
fi
for key in REACT_APP_SUPABASE_URL REACT_APP_SUPABASE_ANON_KEY; do
  if ! grep -qE "^${key}=.+" "$FRONTEND_DIR/.env.local"; then
    echo "$key is missing or empty in fsos-frontend/.env.local — sign-in would be dead." >&2
    exit 1
  fi
done

# Same reasoning as the backend: a dev-login build must never be served publicly.
if grep -qE '^REACT_APP_FSOS_DEV_EMAIL=.+' "$FRONTEND_DIR/.env.local"; then
  echo "REACT_APP_FSOS_DEV_EMAIL is set in fsos-frontend/.env.local. Comment it out." >&2
  exit 1
fi

# Dev login accepts an email header instead of a token. The backend refuses to start
# with it on and a public origin, but fail here with a clearer message.
if grep -qE '^FSOS_DEV_LOGIN=true' "$BACKEND_DIR/.env"; then
  echo "FSOS_DEV_LOGIN=true in $BACKEND_DIR/.env. That lets anyone be anyone. Remove it." >&2
  exit 1
fi

echo "=== Pulling latest ==="
git -C "$REPO_ROOT" pull --ff-only

echo ""
echo "=== Backend: build and restart on 127.0.0.1:8000 ==="
cd "$BACKEND_DIR"
docker build -t fsos-backend .
docker stop fsos-backend 2>/dev/null || true
docker rm   fsos-backend 2>/dev/null || true
# Bound to the loopback on purpose: nginx is the only way in.
docker run -d \
  --name fsos-backend \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file "$BACKEND_DIR/.env" \
  fsos-backend

echo ""
echo "=== Frontend: build ==="
cd "$FRONTEND_DIR"
npm ci --no-audit
# Production talks to /api on this origin (nginx proxies it). Empty string wins over
# .env.local's localhost value so we don't bake a laptop URL into the bundle.
REACT_APP_FSOS_API_URL= npm run build

echo ""
echo "=== Publishing to $WEB_ROOT ==="
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$FRONTEND_DIR/build/" "$WEB_ROOT/"
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=== Health ==="
for i in $(seq 1 15); do
  if curl -fsS -m 3 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS -m 5 http://127.0.0.1:8000/api/health || {
  echo "Backend did not come up. Logs:" >&2
  docker logs --tail 50 fsos-backend >&2
  exit 1
}

echo ""
echo "Done. https://thefrontseatmedia.com"
docker ps --filter name=fsos-backend --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
