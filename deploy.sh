#!/bin/bash
# Full deploy: pull → rebuild backend → rebuild frontend
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$REPO_ROOT/snoboard-backend-feature-frontseat/snoboard-backend-feature-frontseat"
FRONTEND_DIR="$REPO_ROOT/snoboard-frontend-feature-frontseat/snoboard-frontend-feature-frontseat"

echo "=== Pulling latest ==="
cd "$REPO_ROOT"
git pull

echo ""
echo "=== Rebuilding backend (background) ==="
(
  cd "$BACKEND_DIR"
  docker build -t view-tracker-backend .
  docker stop view-tracker-backend 2>/dev/null || true
  docker rm   view-tracker-backend 2>/dev/null || true
  docker run -d \
    --name view-tracker-backend \
    --restart unless-stopped \
    -p 8080:8080 \
    --env-file "$BACKEND_DIR/.env" \
    view-tracker-backend
) &
BACKEND_PID=$!

echo ""
echo "=== Rebuilding frontend ==="
cd "$FRONTEND_DIR"
pm2 stop all 2>/dev/null || true
npm ci
npm run build
pm2 restart all 2>/dev/null || true

echo ""
echo "=== Waiting for backend ==="
wait "$BACKEND_PID"

echo ""
echo "=== Done ==="
docker ps --filter name=view-tracker-backend --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
