#!/usr/bin/env bash
set -euo pipefail

# baseline anti-abuse controls should exist
rg -n 'isRateLimited|dedup|BLOCKED_SENDER_DOMAINS|INGEST_MAX_ATTACHMENTS' app/api/ingest/email/route.ts >/dev/null
rg -n 'rate_limited|MAX_SUBS_PER_10S|MAX_FANOUT_PER_CHANNEL|ACK_MAX_RETRIES' worker/realtime-server.js >/dev/null
rg -n 'ADMIN_SUPER_KEY|x-admin-key' app/api/admin app/api/payments/manual-confirm >/dev/null

echo "attack surface check passed"
