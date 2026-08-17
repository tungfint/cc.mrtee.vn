# ADR 0001 — Implementation clarifications before Phase 0

- Status: Accepted
- Date: 2026-08-18
- Applies to: PRD v2.1 and scoring policy v2.0

This ADR resolves ambiguities found during the pre-implementation review. If an
older sentence in the PRD, Implementation Brief, or Owner Playbook conflicts
with this ADR, this ADR takes precedence until those documents are updated.

## Decisions

1. Wallet balance may become negative only because of a valid `REVERSAL`,
   `PENALTY`, or explicitly authorized correction. `REDEEM` must never make a
   wallet negative, and a user with insufficient balance cannot redeem.
2. Account verification writes `verified_at` and `reward_eligible_from` in the
   same PostgreSQL transaction, before initial backfill is enqueued.
3. Stored reward is rounded to two decimals and clamped inclusively to
   `[0.05, 30.00]`.
4. Season lifecycle is `DRAFT -> ACTIVE -> CLOSING -> CLOSED`.
5. MVP uses one physical BullMQ queue named `cf-sync`. HIGH/LOW work is modeled
   with job priority. Every Codeforces HTTP request, including pagination, goes
   through the same global limiter.
6. Money-like commands are idempotent at database level. EARN, REVERSAL,
   REFUND, admin adjustments, and redeem requests require stable idempotency or
   source keys and appropriate unique constraints. Reversal/refund ledger rows
   link to the transaction they offset.
7. Reward stock is reserved/decremented when a `REQUESTED` order is created.
   It is restored on `REJECTED` or `CANCELLED`, and remains consumed on
   `FULFILLED`. State transitions are explicit and idempotent.
8. Before Phase 9, first-solve code is a deterministic engine used by tests and
   backfill only. Live reward processing is enabled only after first solve,
   EARN, wallet, season aggregate, and level update share the required atomic
   transaction boundary.
9. The document version is PRD v2.1. The initial scoring policy remains v2.0.
10. MVP authorization defaults to explicit organization membership. Roles do
    not implicitly inherit through the organization tree. `SYSTEM_ADMIN` is
    global; organization roles are scoped to their organization.
11. Membership history must support leave and rejoin without overwriting prior
    periods. Phase 1 will use a surrogate membership identifier plus a
    constraint that allows at most one active membership per user and
    organization.
12. The default application timezone is `Asia/Ho_Chi_Minh`.

## Deferred owner decisions

Authentication and onboarding UX will be finalized in Phase 2. Until then the
implementation must keep authentication replaceable and must not invent public
self-registration requirements.
