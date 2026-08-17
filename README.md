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
npm run dev:api
npm run dev:worker
npm run dev:web
```

Services:

- Web: <http://localhost:5173>
- API live health: <http://localhost:3000/api/health/live>
- API readiness: <http://localhost:3000/api/health/ready>
- OpenAPI: <http://localhost:3000/api/docs>

## Validation

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

The product requirements and implementation invariants are defined in the
three root documents. Accepted clarifications are recorded under `docs/adr`.
