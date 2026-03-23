#!/bin/sh
set -eu

PGHOST=${POSTGRES_HOST:-postgres}
PGPORT=${POSTGRES_PORT:-5432}
PGUSER=${POSTGRES_USER:-anonkeymail}
PGPASSWORD=${POSTGRES_PASSWORD:-anonkeymail}
PGDATABASE=${POSTGRES_DB:-anonkeymail}
SYNC_INTERVAL=${POSTFIX_SYNC_INTERVAL_SECONDS:-30}
DOMAINS_FILE=/etc/postfix/virtual_mailbox_domains
ALIAS_FILE=/etc/postfix/virtual_alias_maps

export PGPASSWORD

echo "[postfix] Starting dynamic domain sync..."

wait_for_postgres() {
  until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; do
    echo "[postfix] Waiting for Postgres at $PGHOST:$PGPORT..."
    sleep 2
  done
}

generate_domains_file() {
  tmp_file="${DOMAINS_FILE}.tmp"
  {
    echo "# Auto-generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    psql "postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}" -At -c \
      "SELECT name FROM \"Domain\" WHERE status = 'active' ORDER BY name;"
  } > "$tmp_file"
  mv "$tmp_file" "$DOMAINS_FILE"
}

apply_postfix_config() {
  touch "$ALIAS_FILE"
  postmap "$ALIAS_FILE"
  postmap "$DOMAINS_FILE"

  postconf -e "virtual_mailbox_domains = hash:${DOMAINS_FILE}"
  postconf -e "virtual_mailbox_base = /var/spool/virtual"
  postconf -e "virtual_minimum_uid = 100"
  postconf -e "virtual_uid_maps = static:5000"
  postconf -e "virtual_gid_maps = static:5000"
  postconf -e "virtual_alias_maps = hash:${ALIAS_FILE}"
}

sync_domains() {
  generate_domains_file
  apply_postfix_config
  if postfix status >/dev/null 2>&1; then
    postfix reload >/dev/null 2>&1 || true
  fi
  echo "[postfix] Domain map refreshed"
}

watch_domains() {
  (
    last_checksum=""
    while true; do
      generate_domains_file
      current_checksum=$(sha256sum "$DOMAINS_FILE" | awk '{print $1}')
      if [ "$current_checksum" != "$last_checksum" ]; then
        apply_postfix_config
        if postfix status >/dev/null 2>&1; then
          postfix reload >/dev/null 2>&1 || true
        fi
        echo "[postfix] Applied updated domain list checksum=$current_checksum"
        last_checksum="$current_checksum"
      fi
      sleep "$SYNC_INTERVAL"
    done
  ) &
}

wait_for_postgres
sync_domains
watch_domains

echo "[postfix] Dynamic domains loaded successfully"
exec "$@"
