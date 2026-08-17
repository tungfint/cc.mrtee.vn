# Database package

This package owns the Drizzle schema and reviewed SQL migrations for the
Codeforces Gamification Tracker.

## Commands

```bash
npm run db:generate
npm run db:check
npm run db:migrate
npm test --workspace @cc/database
```

## Migration policy

Production migrations are forward-only. Never edit a migration that has been
applied outside an ephemeral development database. Corrections are delivered as
a new migration. Before a destructive or long-running production migration:

1. take and verify a PostgreSQL backup;
2. test the forward migration on staging with production-like data;
3. document the application rollback and database restore point;
4. deploy schema-compatible application code in the safe order.

Local/test databases may be recreated from migrations and seeds. Production
rollback means rolling the application back when schema-compatible, or restoring
the verified backup when the database change cannot be reversed safely.
