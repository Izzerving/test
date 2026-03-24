#!/usr/bin/env bash
set -euo pipefail

echo "=== Time-Email production deploy ==="

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "[FATAL] docker compose not found"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "[FATAL] .env not found. Create it from .env.example first."
  exit 1
fi

ensure_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|g" .env
  else
    echo "${key}=\"${value}\"" >> .env
  fi
}

echo "[1/5] Ensuring essential .env values..."
ensure_env_var "NEXT_PUBLIC_APP_NAME" "Time-Email"
if ! grep -q '^SESSION_COOKIE_SECRET=' .env; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
  else
    secret="$(date +%s%N | sha256sum | awk '{print $1}')"
  fi
  echo "SESSION_COOKIE_SECRET=\"${secret}\"" >> .env
  echo "SESSION_COOKIE_SECRET was generated and added."
fi

echo "[2/5] Building production images..."
$DC --profile production build app worker worker-payment realtime postfix proxy

echo "[3/5] Starting production services..."
$DC --profile production up -d

echo "[4/5] Service status..."
$DC ps

echo "[5/5] Health checks..."
$DC logs app --tail=80 || true
curl -fsS http://127.0.0.1:3000/api/healthz || true

echo "=== Deploy completed ==="
