#!/bin/bash
# Deploy FSOS on the EC2 box that already runs snoboard via nginx + pm2.
# No Docker required — backend runs under pm2 (uvicorn).
#
#   ./deploy-fsos-pm2.sh
#
# Expects:
#   - repo at /home/ec2-user/View-tracker- on branch fsos
#   - fsos-backend/.env present (FSOS_DEV_LOGIN must not be true)
#   - node + npm + python3 available
#   - nginx conf.d/frontseat.conf already pointing at FSOS (see deploy/frontseat.conf)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$REPO_ROOT/fsos-backend"
FRONTEND_DIR="$REPO_ROOT/fsos-frontend"
VENV_DIR="$BACKEND_DIR/.venv"
# Must match `root` in deploy/frontseat.conf.
WEB_ROOT="/var/www/fsos"

branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "fsos" ]; then
  echo "On branch '$branch', expected 'fsos'." >&2
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "Missing $BACKEND_DIR/.env" >&2
  exit 1
fi

if grep -qE '^FSOS_DEV_LOGIN=true' "$BACKEND_DIR/.env"; then
  echo "FSOS_DEV_LOGIN=true in .env — turn it off before deploying." >&2
  exit 1
fi

# The Supabase URL and anon key are compiled into the bundle at build time — sign-in is
# the only thing the browser does directly. .env.local is git-ignored, so a fresh clone
# here does not have it, and without this the build succeeds and ships an app whose
# login page reads "Sign-in isn't configured".
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  cat >&2 <<'MISSING'
Missing fsos-frontend/.env.local — nobody would be able to sign in. Create it here:

  REACT_APP_SUPABASE_URL=https://huyylvmlwpphuolpckxw.supabase.co
  REACT_APP_SUPABASE_ANON_KEY=<anon key from Supabase → Project Settings → API Keys>

Leave REACT_APP_FSOS_API_URL out; this script builds with it empty on purpose.
MISSING
  exit 1
fi
for key in REACT_APP_SUPABASE_URL REACT_APP_SUPABASE_ANON_KEY; do
  if ! grep -qE "^${key}=.+" "$FRONTEND_DIR/.env.local"; then
    echo "$key is missing or empty in fsos-frontend/.env.local — sign-in would be dead." >&2
    exit 1
  fi
done

if grep -qE '^REACT_APP_FSOS_DEV_EMAIL=.+' "$FRONTEND_DIR/.env.local"; then
  echo "REACT_APP_FSOS_DEV_EMAIL is set — that bypasses login. Comment it out." >&2
  exit 1
fi

echo "=== Pulling latest ==="
git -C "$REPO_ROOT" pull --ff-only

echo ""
echo "=== Backend: venv + deps + pm2 ==="
cd "$BACKEND_DIR"

# The API is written against 3.10+: `str | None` in an annotation is evaluated when the
# function is defined, so on 3.9 the app fails at import, not at request time. Amazon
# Linux 2023 ships 3.9 as `python3`, so pick a newer one explicitly rather than
# inheriting whatever `python3` happens to be.
PY=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      PY="$candidate"
      break
    fi
  fi
done
if [ -z "$PY" ]; then
  echo 'No Python 3.10+ found. The API needs it: "str | None" annotations fail to' >&2
  echo 'import on 3.9. On Amazon Linux 2023:  sudo dnf install -y python3.11' >&2
  exit 1
fi
echo "  using $PY ($("$PY" --version 2>&1))"

# Rebuild the venv if it was made with a Python that's too old, or a different one.
if [ -d "$VENV_DIR" ] && ! "$VENV_DIR/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
  echo "  existing venv is on an older Python — rebuilding it"
  rm -rf "$VENV_DIR"
fi
if [ ! -d "$VENV_DIR" ]; then
  "$PY" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate

# Restart under pm2 (loopback only via uvicorn bind — nginx proxies)
pm2 delete fsos-backend 2>/dev/null || true
pm2 start "$VENV_DIR/bin/uvicorn" \
  --name fsos-backend \
  --cwd "$BACKEND_DIR" \
  --interpreter none \
  -- app.main:app --host 127.0.0.1 --port 8000
pm2 save

echo ""
echo "=== Frontend: build ==="
# webpack wants more than this box has. 916MB of RAM with no swap doesn't fail cleanly,
# it thrashes until you give up and press Ctrl-C.
avail_mb="$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 9999)"
swap_mb="$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "$avail_mb" -lt 1500 ] && [ "$swap_mb" -lt 512 ]; then
  cat >&2 <<SWAP
Only ${avail_mb}MB available and ${swap_mb}MB of swap. The production build needs
roughly 1.5GB and will stall rather than fail. Add swap first:

  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
SWAP
  exit 1
fi
cd "$FRONTEND_DIR"
npm ci --no-audit
# Webpack needs more headroom than snoboard's vite build, which is already capped at
# 768MB on this box — so cap it explicitly rather than letting node guess and get
# OOM-killed halfway through. Raise it if the box has the memory.
# REACT_APP_FSOS_API_URL= : production talks to /api on this origin, and an empty value
# beats .env.local's localhost. Verified — the compiled base is the empty string.
NODE_OPTIONS="--max-old-space-size=1024" REACT_APP_FSOS_API_URL= npm run build

echo ""
echo "=== Publishing to $WEB_ROOT ==="
# Out of the home directory: nginx runs as `nginx` and /home/ec2-user is mode 700, so
# serving from there is a 403 on every request.
sudo mkdir -p "$WEB_ROOT"
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete "$FRONTEND_DIR/build/" "$WEB_ROOT/"
else
  # Amazon Linux minimal images don't always ship rsync. Replace wholesale rather than
  # copying over the top, or the last deploy's hashed bundles linger forever.
  sudo find "$WEB_ROOT" -mindepth 1 -delete
  sudo cp -a "$FRONTEND_DIR/build/." "$WEB_ROOT/"
fi
sudo chown -R nginx:nginx "$WEB_ROOT"
# If SELinux is enforcing, files under /var/www carry the wrong label and nginx gets a
# 403 that looks exactly like a permissions bug. No-op when SELinux is off.
if command -v restorecon >/dev/null 2>&1; then
  sudo restorecon -R "$WEB_ROOT" 2>/dev/null || true
fi

echo ""
echo "=== Nginx ==="
# The backup lives outside conf.d. nginx includes conf.d/*.conf, and a copy sitting
# next to the live file is one rename away from being loaded as a second vhost.
BACKUP=/etc/nginx/frontseat.conf.pre-fsos
if [ -f "$REPO_ROOT/deploy/frontseat.conf" ]; then
  # Keep one copy of whatever was there before — this is the rollback to snoboard.
  if [ -f /etc/nginx/conf.d/frontseat.conf ] && [ ! -f "$BACKUP" ]; then
    sudo cp /etc/nginx/conf.d/frontseat.conf "$BACKUP"
    echo "  previous vhost saved to $BACKUP"
  fi
  sudo cp "$REPO_ROOT/deploy/frontseat.conf" /etc/nginx/conf.d/frontseat.conf
fi

# A second vhost claiming the same server_name silently wins or loses depending on load
# order, and the deploy then "succeeds" while the old site is still being served.
# Only *.conf counts — that's all nginx includes.
dupes="$(grep -lE 'server_name[^;]*thefrontseatmedia\.com' /etc/nginx/conf.d/*.conf 2>/dev/null \
         | grep -v '/frontseat\.conf$' || true)"
if [ -n "$dupes" ]; then
  echo "Another nginx vhost also claims thefrontseatmedia.com:" >&2
  echo "$dupes" >&2
  echo "Move it aside (rename so it doesn't end in .conf) and re-run." >&2
  exit 1
fi

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
  pm2 logs fsos-backend --lines 40 --nostream >&2
  exit 1
}

echo ""
echo "Done. https://thefrontseatmedia.com"
pm2 list
