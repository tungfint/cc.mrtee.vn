# DEV simulation seed

Run only against a development database after migrations:

```bash
npm run seed:dev
```

The command refuses to run when `NODE_ENV=production`. It creates a public demo
class, current and previous seasons, rewards, an administrator, and seven
student patterns from the owner playbook: beginner, strong, shock-high,
shock-then-easy, easy farmer, consistent, and challenge. Every solve has a real
canonical submission/first-solve row; point rewards use policy v2.0 with the
level immediately before that solve. Wallets and active-season totals are
derived from the immutable ledger.
Synthetic Codeforces accounts are scheduled for 2099 so the worker does not
send their intentionally fake handles to the upstream API. The seed also
removes any queued jobs for those fixed demo account IDs.

Credentials default to:

- `admin@demo.local` / `DemoChangeMe!2026`
- any student email printed by the seed / `DemoChangeMe!2026`

Override the shared password with `DEV_SEED_PASSWORD`. The command prints the
expected solve count, active days, CC calculated/level, and season score for
each scenario so dashboard and leaderboard behavior can be compared. Fixed IDs
and idempotency keys make repeat runs safe; season snapshots remain untouched
after their first creation.

This dataset is synthetic and must never be copied to production.
