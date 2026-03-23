#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SLO_HEALTH_MS=${SLO_HEALTH_MS:-2000}
SLO_RECONCILE_MS=${SLO_RECONCILE_MS:-5000}
APP_URL=${APP_URL:-http://localhost:3000}

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

need docker
need curl

cleanup() {
  docker compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf "[staging] building stack...\n"
docker compose up -d --build postgres redis app worker worker-payment realtime

printf "[staging] waiting for health...\n"
START=$(date +%s%3N)
for _ in {1..60}; do
  if curl -fsS "$APP_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
END=$(date +%s%3N)
HEALTH_MS=$((END-START))

if ! curl -fsS "$APP_URL/api/health" >/dev/null 2>&1; then
  echo "[staging] health check failed"
  exit 1
fi

printf "[staging] health ready in %sms\n" "$HEALTH_MS"
if [ "$HEALTH_MS" -gt "$SLO_HEALTH_MS" ]; then
  echo "[staging][warn] SLO breach: health readiness ${HEALTH_MS}ms > ${SLO_HEALTH_MS}ms"
fi

printf "[staging] running quality checks...\n"
bash scripts/quality_gate.sh

if [ -n "${ADMIN_SUPER_KEY:-}" ]; then
  printf "[staging] triggering reconcile...\n"
  R0=$(date +%s%3N)
  curl -fsS -X POST "$APP_URL/api/admin/payments/reconcile" -H "x-admin-key: $ADMIN_SUPER_KEY" >/dev/null
  R1=$(date +%s%3N)
  RECONCILE_MS=$((R1-R0))
  printf "[staging] reconcile finished in %sms\n" "$RECONCILE_MS"
  if [ "$RECONCILE_MS" -gt "$SLO_RECONCILE_MS" ]; then
    echo "[staging][warn] SLO breach: reconcile ${RECONCILE_MS}ms > ${SLO_RECONCILE_MS}ms"
  fi
else
  echo "[staging][warn] ADMIN_SUPER_KEY is not set; reconcile SLA probe skipped"
fi

printf "[staging] matrix passed\n"
