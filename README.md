# Codeforces Gamification Tracker

Production-oriented modular monolith for tracking Codeforces learning progress,
skill level, rewards, seasons, and organization leaderboards.

## Prerequisites

- Node.js 24 LTS
- npm 11+
- Docker with Docker Compose (for PostgreSQL and Redis)

## Development

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run bootstrap-admin --workspace @cc/api
npm run dev:api
npm run dev:worker
npm run dev:web
```

Services:

- Web: <http://localhost:5173>
- API live health: <http://localhost:3000/api/health/live>
- API readiness: <http://localhost:3000/api/health/ready>
- OpenAPI: <http://localhost:3000/api/docs>

PostgreSQL is exposed on port `55432` by default because Windows installations
often already use `5432`. The Compose initialization also creates the isolated
`cc_tracker_test` database used by schema integration tests.

## Database

```bash
npm run db:generate # generate a reviewed SQL migration after a schema change
npm run db:check    # validate migration metadata
npm run db:migrate  # apply pending migrations to DATABASE_URL
npm test --workspace @cc/database
```

See `packages/database/README.md` for the forward-only migration and rollback
policy.

Public registration is intentionally disabled. Set the three
`BOOTSTRAP_ADMIN_*` values in `.env` and run the bootstrap command once to
create the first system administrator. Authentication uses an HTTP-only session
cookie and requires the CSRF token returned by login for state-changing API
requests.

## Validation

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run db:check
```

For a reproducible seven-scenario simulation dataset, run `npm run seed:dev` and
use the credentials printed by the command. This seed refuses production mode;
details and expected outputs are in `docs/dev-simulation.md`.

Production deployment, monitoring, and the completed readiness audit are in:

- `docs/production-runbook.md`
- `docs/monitoring.md`
- `docs/production-readiness.md`

The product requirements and implementation invariants are defined in the
three root documents. Accepted clarifications are recorded under `docs/adr`.
