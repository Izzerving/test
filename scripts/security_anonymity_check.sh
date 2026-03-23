#!/usr/bin/env bash
set -euo pipefail

# service web domain must never be used in mailbox issuance points
if rg -n 'www\.time-email\.com' app/api/mailboxes app/api/ingest prisma/seed.js | rg -v 'IMPORTANT|service web domain|NOT be used' >/dev/null; then
  echo "FAIL: service domain leaked into issuance-related code paths" >&2
  exit 1
fi

# keyHash should not appear outside auth register/login internals
if rg -n 'keyHash' app/api/auth | rg -v 'app/api/auth/login/route.ts|app/api/auth/register/route.ts|app/api/auth/delete/route.ts' >/dev/null; then
  echo "FAIL: unexpected keyHash usage outside allowed auth internals" >&2
  exit 1
fi

echo "anonymity check passed"
