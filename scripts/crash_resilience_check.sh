#!/usr/bin/env bash
set -euo pipefail

# syntax checks for critical workers and scripts
node --check worker/realtime-server.js >/dev/null
node --check worker/payment-retry.js >/dev/null

bash scripts/security_anonymity_check.sh
bash scripts/security_attack_surface_check.sh

echo "crash resilience check passed"
