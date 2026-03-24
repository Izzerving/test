#!/bin/sh
set -eu

echo "[entrypoint] Starting app bootstrap..."

run_prisma_migrate_deploy() {
  npx prisma migrate deploy 2>&1
}

recover_known_migration_failure() {
  output="$1"

  # Self-heal for known broken historical state:
  # 1) failed migration record for referral migration (P3009)
  # 2) old referral migration failing on missing GlobalSetting table (P3018 / relation does not exist)
  if echo "$output" | grep -Eq "20260320000000_add_referral_system"; then
    if echo "$output" | grep -Eq "P3009|P3018|relation \"GlobalSetting\" does not exist"; then
      echo "[entrypoint] Attempting automatic recovery for 20260320000000_add_referral_system..."
      npx prisma migrate resolve --rolled-back 20260320000000_add_referral_system >/dev/null 2>&1 || true
      return 0
    fi
  fi

  return 1
}

attempt=0
max_attempts=${DB_WAIT_MAX_ATTEMPTS:-30}
until migrate_output=$(run_prisma_migrate_deploy); do
  echo "$migrate_output"

  if recover_known_migration_failure "$migrate_output"; then
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] Automatic recovery attempts exceeded ($attempt/$max_attempts)"
      exit 1
    fi
    echo "[entrypoint] Recovery applied, retrying migrate deploy... ($attempt/$max_attempts)"
    sleep 1
    continue
  fi

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
