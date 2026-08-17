# Production runbook

## First deployment

Use a Linux host with Docker Engine and Docker Compose v2. Clone the repository, create a private `.env` from `.env.example`, then set at least:

```text
POSTGRES_DB=cc_tracker
POSTGRES_USER=cc_app
POSTGRES_PASSWORD=<strong-random-secret>
PUBLIC_ORIGIN=https://cc.example.edu.vn
HTTP_PORT=80
```

Build and start from a clean checkout:

```bash
docker compose --env-file .env -f compose.production.yml build
docker compose --env-file .env -f compose.production.yml up -d
docker compose --env-file .env -f compose.production.yml ps
```

The one-shot `migrate` service must complete successfully before API and worker start. PostgreSQL and Redis have no published host ports. Terminate TLS at the host/cloud load balancer, or adapt the Caddy address and certificate configuration for direct TLS.

Bootstrap the first administrator once:

```bash
docker compose --env-file .env -f compose.production.yml exec \
  -e BOOTSTRAP_ADMIN_EMAIL=admin@example.edu.vn \
  -e BOOTSTRAP_ADMIN_PASSWORD='<strong-one-time-password>' \
  -e BOOTSTRAP_ADMIN_NAME='System Administrator' \
  api node apps/api/dist/auth/bootstrap-admin.js
```

## Verification and operations

Check `GET /api/health/live` and `GET /api/health/ready`, then log in and verify dashboard, leaderboard, sync and a test account. Inspect logs with `docker compose ... logs api worker`.

Create a daily encrypted off-host backup:

```bash
POSTGRES_USER=cc_app POSTGRES_DB=cc_tracker ./scripts/backup-postgres.sh /secure/backups
```

Test restore on an isolated environment regularly:

```bash
POSTGRES_USER=cc_app POSTGRES_DB=cc_tracker RESTORE_CONFIRM=yes \
  ./scripts/restore-postgres.sh /secure/backups/cc-tracker-YYYYMMDDTHHMMSSZ.dump
```

Before an upgrade, take a backup, build immutable images, run the migration service and only then replace API/worker/web. Migrations are forward-only; restore the pre-deploy backup if application rollback also requires a database rollback.
