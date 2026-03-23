#!/usr/bin/env bash
set -euo pipefail

APP_URL=${APP_URL:-http://localhost:3000}
ALLOW_SKIP=${ALLOW_SKIP:-1}
REQS=${REQS:-100}
CONCURRENCY=${CONCURRENCY:-10}
P95_TARGET_MS=${P95_TARGET_MS:-800}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1"; exit 1; }; }
need curl
need awk

if ! curl -fsS "$APP_URL/api/health" >/dev/null 2>&1; then
  if [ "$ALLOW_SKIP" = "1" ]; then
    echo "[warn] app is not reachable at $APP_URL, skipping load/SLO probe"
    exit 0
  fi
  echo "app is not reachable at $APP_URL"
  exit 1
fi

TMP=$(mktemp)

run_one() {
  local t
  t=$(curl -s -o /dev/null -w "%{time_total}" "$APP_URL/api/health")
  awk -v x="$t" 'BEGIN { printf "%.0f\n", x*1000 }' >> "$TMP"
}

export -f run_one
export APP_URL TMP

seq "$REQS" | xargs -n1 -P "$CONCURRENCY" bash -lc 'run_one' >/dev/null 2>&1

COUNT=$(wc -l < "$TMP" | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "no samples collected"; exit 1
fi

P95=$(sort -n "$TMP" | awk -v c="$COUNT" 'BEGIN{idx=int(c*0.95); if(idx<1) idx=1} NR==idx{print $1; exit}')
AVG=$(awk '{s+=$1} END{printf "%.0f", s/NR}' "$TMP")
MAX=$(sort -n "$TMP" | tail -n1)

echo "load probe samples=$COUNT avg=${AVG}ms p95=${P95}ms max=${MAX}ms"
if [ "$P95" -gt "$P95_TARGET_MS" ]; then
  echo "[warn] p95 SLO breach: ${P95}ms > ${P95_TARGET_MS}ms"
fi

echo "staging load/SLO probe completed"
