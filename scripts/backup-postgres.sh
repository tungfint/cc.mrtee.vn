#!/usr/bin/env sh
set -eu

umask 077

backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"

if [ "$backup_dir" = '/' ]; then
  printf 'Refusing to use the filesystem root as a backup directory.\n' >&2
  exit 2
fi

retention_days="${BACKUP_RETENTION_DAYS:-30}"
case "$retention_days" in
  '' | *[!0-9]*)
    printf 'BACKUP_RETENTION_DAYS must be a non-negative integer.\n' >&2
    exit 2
    ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/cc-tracker-$timestamp.dump"
partial_file="$backup_file.partial.$$"

cleanup() {
  if [ -n "${partial_file:-}" ]; then
    rm -f -- "$partial_file"
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose -f compose.production.yml exec -T postgres sh -eu -c \
  'pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  > "$partial_file"

test -s "$partial_file"
docker compose -f compose.production.yml exec -T postgres \
  pg_restore --list < "$partial_file" > /dev/null

if [ -e "$backup_file" ]; then
  printf 'Backup target already exists: %s\n' "$backup_file" >&2
  exit 4
fi

mv "$partial_file" "$backup_file"
partial_file=''

printf 'Backup created: %s\n' "$backup_file"

find "$backup_dir" -maxdepth 1 -type f -name 'cc-tracker-*.dump' \
  -mtime "+$retention_days" -delete
