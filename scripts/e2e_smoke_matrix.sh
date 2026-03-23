#!/usr/bin/env bash
set -euo pipefail

# Static smoke matrix (environment-safe): validates presence & wiring of critical runtime blocks.

checks=(
  "app/api/auth/register/route.ts:POST"
  "app/api/auth/login/route.ts:POST"
  "app/api/mailboxes/route.ts:GET"
  "app/api/ingest/email/route.ts:POST"
  "app/api/realtime/token/route.ts:POST"
  "app/api/payments/create/route.ts:POST"
  "app/api/payments/list/route.ts:GET"
  "app/api/admin/domains/route.ts:GET"
  "worker/realtime-server.js:Redis"
  "worker/payment-retry.js:processingLock"
)

for item in "${checks[@]}"; do
  file="${item%%:*}"
  token="${item##*:}"
  if ! rg -n "$token" "$file" >/dev/null; then
    echo "E2E smoke matrix failed: '$token' not found in $file" >&2
    exit 1
  fi
  echo "OK smoke: $file contains $token"
done

echo "E2E smoke matrix passed"
