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

echo "=== Pulling latest ==="
git -C "$REPO_ROOT" pull --ff-only

echo ""
echo "=== Backend: venv + deps + pm2 ==="
cd "$BACKEND_DIR"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
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
cd "$FRONTEND_DIR"
npm ci --no-audit
REACT_APP_FSOS_API_URL= npm run build

echo ""
echo "=== Nginx reload ==="
if [ -f "$REPO_ROOT/deploy/frontseat.conf" ]; then
  sudo cp "$REPO_ROOT/deploy/frontseat.conf" /etc/nginx/conf.d/frontseat.conf
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
