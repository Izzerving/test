#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BRANCH="${BRANCH:-codex/implement-cron-worker-for-cleanup-tasks}"
PROFILE="${COMPOSE_PROFILE:-production}"

cd "$PROJECT_DIR"

echo "[deploy] Fetch latest code"
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[deploy] Build and start services"
docker compose --profile "$PROFILE" up -d --build

echo "[deploy] Run migrations"
docker compose exec -T app npx prisma migrate deploy

echo "[deploy] Restart app/workers"
docker compose restart app worker worker-payment realtime

echo "[deploy] Health check"
curl -fsS http://127.0.0.1:3000/api/health >/dev/null

echo "[deploy] Done"
