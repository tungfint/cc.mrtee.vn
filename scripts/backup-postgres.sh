#!/usr/bin/env sh
set -eu

backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/cc-tracker-$timestamp.dump"

docker compose -f compose.production.yml exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" > "$backup_file"

test -s "$backup_file"
printf 'Backup created: %s\n' "$backup_file"
