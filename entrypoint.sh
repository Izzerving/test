#!/bin/sh
set -eu

echo "[entrypoint] Starting app bootstrap..."

attempt=0
max_attempts=${DB_WAIT_MAX_ATTEMPTS:-30}
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] Prisma migrations failed after $attempt attempts"
    exit 1
  fi

  echo "[entrypoint] Database not ready yet, retrying in 2s... ($attempt/$max_attempts)"
  sleep 2
done

echo "[entrypoint] Running seed..."
npm run prisma:seed

echo "[entrypoint] Starting Next.js..."
exec npm run start
