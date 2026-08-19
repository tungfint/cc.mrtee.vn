# Production readiness audit

Audit date: 2026-08-20. Scope: the complete repository through Phase 19 and production hardening.

| Area                       | Status | Evidence / disposition                                                                                                                     |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Security                | PASS   | Helmet in API, restrictive Caddy headers/CSP, rate limits on login/sync/redeem; Swagger disabled in production.                            |
| 2. Authentication          | PASS   | Scrypt password hashes, opaque hashed sessions, HTTP-only secure cookie in production, CSRF on mutations, lockout after repeated failures. |
| 3. RBAC                    | PASS   | Deny-by-default guards plus system and organization role checks; integration coverage.                                                     |
| 4. Database constraints    | PASS   | Foreign keys, checks, unique first-solve/reward/idempotency constraints, immutable ledger and snapshots.                                   |
| 5. Migration safety        | PASS   | Forward-only reviewed SQL and migration check; fresh-database rehearsal required by release checklist.                                     |
| 6. First-solve correctness | PASS   | Canonical `(user_id, problem_key)` key and transactional ingestion tests.                                                                  |
| 7. Scoring correctness     | PASS   | Versioned v2.0 policy, pure formula tests, pre-solve level/rating snapshots.                                                               |
| 8. Reward idempotency      | PASS   | Unique source submission and idempotency keys; retry integration tests.                                                                    |
| 9. Wallet concurrency      | PASS   | Row locking and atomic order/ledger/wallet updates; concurrent redemption test.                                                            |
| 10. BullMQ retry/dedup     | PASS   | Stable job IDs, bounded retry/backoff, database-backed sync state.                                                                         |
| 11. Codeforces limiting    | PASS   | Every upstream request uses the shared Redis limiter at 2200 ms.                                                                           |
| 12. Scheduler recovery     | PASS   | Advisory lock, due-account recovery, capacity reserve, multi-worker tests.                                                                 |
| 13. Season boundaries      | PASS   | Event-time attribution and atomic, immutable close snapshots.                                                                              |
| 14. Rejudge reconciliation | PASS   | Reversal ledger entries, replacement promotion, closed-season audit workflow.                                                              |
| 15. Privacy                | PASS   | Private organizations are authorization-gated; logs omit bodies, credentials, cookies and query values.                                    |
| 16. Backup/restore         | PASS   | Atomic validated dumps, 30-day retention, a daily systemd timer and restore rehearsal gate.                                                |
| 17. Secrets                | PASS   | Required production secrets are environment-only; examples contain placeholders.                                                           |
| 18. Docker/network         | PASS   | Only the web service binds to host loopback; API, PostgreSQL and Redis stay on the Compose network with health checks.                     |
| 19. Logging/monitoring     | PASS   | Structured logs and protected metrics; Docker local logs rotate at 10 MB x 5 files per container.                                          |
| 20. Resource usage         | PASS   | Bounded DB pools, queue concurrency, pagination and adaptive sync scheduling.                                                              |

## Findings

- BLOCKER: none.
- HIGH: none after Phase 19 fixes.
- MEDIUM: the VPS backup still requires encrypted off-host replication to protect against total host loss.
- LOW: container logs have bounded local retention but no external collector for long-term search.
- LOW: TLS terminates at host Nginx; keep the loopback-only web upstream inaccessible from the public network.
- LOW: `npm audit` reports moderate issues only in development tooling; production dependency audit is clean. Recheck during each release.
- LOW: the included load smoke detects regressions but is not a capacity benchmark. Establish capacity targets from pilot traffic before a broad rollout.

## Release gates

Before production, all repository checks, fresh migration, backup/restore rehearsal,
production image build, health checks, and a staging browser journey must pass on
the exact release commit. Stop release for any BLOCKER, failed wallet
reconciliation, failed restore, or failing readiness probe.

## Verification record

- 77 unit/integration tests passed across API, web, worker, core, and database.
- TypeScript strict check, ESLint, Prettier, production build, and Drizzle metadata check passed.
- All five migrations ran on a new empty PostgreSQL database and produced 20 application tables.
- A custom-format PostgreSQL dump restored into an isolated database with 20 tables and all 5 migration records.
- Production dependency audit reported 0 known vulnerabilities.
- Local API smoke covered student/admin login, dashboard, leaderboard, rewards, members, and static web delivery.
- Load smoke completed 200/200 requests at concurrency 20, with p95 60.23 ms on this development machine.
- A clean five-container production stack built and became healthy; Caddy returned CSP/frame headers, protected metrics returned 200 with token and 401 without it, Swagger returned 404, and API/web ran as non-root users.
