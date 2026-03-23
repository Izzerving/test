#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "docs/FULL_TZ_RU.md"
  "docs/TZ_EXECUTION_AUDIT_AND_PLAN_RU.md"
  "REPO_STATUS_REVIEW_RU.md"
  "prisma/schema.prisma"
  "docker-compose.yml"
  "README.md"
  "scripts/compat_check.sh"
  "scripts/domain_policy_check.sh"
  "scripts/e2e_smoke_matrix.sh"
)

for f in "${required_files[@]}"; do
  if [[ ! -f "$root_dir/$f" ]]; then
    echo "Missing required file: $f" >&2
    exit 1
  fi
  echo "OK: $f"
done

"$root_dir/scripts/compat_check.sh"
"$root_dir/scripts/domain_policy_check.sh"
"$root_dir/scripts/e2e_smoke_matrix.sh"

echo "Quality gate checks passed"
