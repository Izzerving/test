#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

required_patterns=(
  "model Domain"
  "maxMailboxes\s+Int\s+@default\(500\)"
  "currentMailboxes\s+Int\s+@default\(0\)"
  "status\s+DomainStatus"
  "tokenHash\s+String\s+@unique"
)

for pattern in "${required_patterns[@]}"; do
  if ! rg -n "$pattern" prisma/schema.prisma >/dev/null; then
    echo "Compatibility check failed: missing pattern '$pattern'" >&2
    exit 1
  fi
  echo "OK pattern: $pattern"
done

echo "Compatibility checks passed"
