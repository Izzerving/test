#!/usr/bin/env bash
set -euo pipefail

# service domain must not be in mailbox issuance pools (exact string entry)
if rg -n '"www\.time-email\.com"' app/api/mailboxes/random/route.ts prisma/seed.js >/dev/null; then
  echo "Domain policy check failed: service domain found in mailbox issuance pools" >&2
  exit 1
fi

echo "Domain policy check passed"
