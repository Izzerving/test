#!/bin/sh
set -eu

echo "[entrypoint] Starting app bootstrap..."

attempt=0
max_attempts=${DB_WAIT_MAX_ATTEMPTS:-30}
until migrate_output=$(npx prisma migrate deploy 2>&1); do
  echo "$migrate_output"

  if echo "$migrate_output" | grep -Eq "P3009|P3018|P3021|relation .* does not exist"; then
    echo "[entrypoint] Prisma migration failed with a non-retryable error"
    exit 1
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] Prisma migrations failed after $attempt attempts"
    exit 1
  fi

  echo "[entrypoint] Database not ready yet, retrying in 2s... ($attempt/$max_attempts)"
  sleep 2
done
echo "$migrate_output"

echo "[entrypoint] Running seed..."
npm run prisma:seed

echo "[entrypoint] Starting Next.js..."
exec npm run start
