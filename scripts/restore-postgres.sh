#!/usr/bin/env sh
set -eu

backup_file="${1:-}"
if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  printf 'Usage: RESTORE_CONFIRM=yes %s /path/to/backup.dump\n' "$0" >&2
  exit 2
fi
if [ "${RESTORE_CONFIRM:-}" != 'yes' ]; then
  printf 'Restore refused. Set RESTORE_CONFIRM=yes after verifying the target environment.\n' >&2
  exit 3
fi

docker compose -f compose.production.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-acl \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" < "$backup_file"

printf 'Restore completed from: %s\n' "$backup_file"
