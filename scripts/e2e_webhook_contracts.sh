#!/usr/bin/env bash
set -euo pipefail

APP_URL=${APP_URL:-http://localhost:3000}
ALLOW_SKIP=${ALLOW_SKIP:-1}
STARS_SECRET=${STARS_SECRET:-stars_test_secret}
CRYPTO_SECRET=${CRYPTO_SECRET:-crypto_test_secret}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1"; exit 1; }; }
need curl
need openssl

if ! curl -fsS "$APP_URL/api/health" >/dev/null 2>&1; then
  if [ "$ALLOW_SKIP" = "1" ]; then
    echo "[warn] app is not reachable at $APP_URL, skipping webhook contract e2e"
    exit 0
  fi
  echo "app is not reachable at $APP_URL"
  exit 1
fi

sign() {
  local secret="$1"
  local body="$2"
  printf "%s" "${secret}:${body}" | openssl dgst -sha256 | awk '{print $2}'
}

# invalid signature should fail
BAD=$(curl -s -o /tmp/wb_bad.out -w "%{http_code}" -X POST "$APP_URL/api/payments/webhook/stars" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: bad" \
  --data '{"externalId":"does_not_matter"}')
[ "$BAD" = "403" ] || { echo "expected 403 on bad stars signature, got $BAD"; cat /tmp/wb_bad.out; exit 1; }

# stars contract
S_BODY='{"externalId":"stars_contract_test_1"}'
S_SIG=$(sign "$STARS_SECRET" "$S_BODY")
S_CODE=$(curl -s -o /tmp/wb_stars.out -w "%{http_code}" -X POST "$APP_URL/api/payments/webhook/stars" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $S_SIG" \
  --data "$S_BODY")
if [ "$S_CODE" != "404" ] && [ "$S_CODE" != "200" ]; then
  echo "unexpected stars status: $S_CODE"; cat /tmp/wb_stars.out; exit 1
fi

# cryptobot contract
C_BODY='{"payload":"cb_contract_test_1"}'
C_SIG=$(sign "$CRYPTO_SECRET" "$C_BODY")
C_CODE=$(curl -s -o /tmp/wb_crypto.out -w "%{http_code}" -X POST "$APP_URL/api/payments/webhook/cryptobot" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $C_SIG" \
  --data "$C_BODY")
if [ "$C_CODE" != "404" ] && [ "$C_CODE" != "200" ]; then
  echo "unexpected cryptobot status: $C_CODE"; cat /tmp/wb_crypto.out; exit 1
fi

echo "webhook contract e2e passed"
