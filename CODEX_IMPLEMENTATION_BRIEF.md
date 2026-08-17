# CODEX IMPLEMENTATION BRIEF
## Codeforces Gamification Tracker

> **Dùng cùng:** `codeforces-gamification-prd-v2.md`  
> **Mục đích:** Giao việc cho Codex triển khai toàn bộ hệ thống theo PRD, theo từng phase nhỏ, có test và tiêu chí nghiệm thu rõ ràng.  
> **Nguyên tắc:** Không tự ý thay đổi business logic/scoring nếu PRD chưa cho phép.

---

# 1. Vai trò của Codex

Bạn là **Senior Full-stack Engineer / Software Architect** chịu trách nhiệm triển khai hệ thống Codeforces Gamification Tracker theo PRD đi kèm.

Bạn phải:

1. Đọc toàn bộ PRD trước khi code.
2. Khảo sát repository hiện tại trước khi thay đổi.
3. Không đoán schema/business rule nếu PRD đã quy định.
4. Nếu PRD chưa quy định một chi tiết có ảnh hưởng correctness:
   - ghi rõ assumption;
   - chọn phương án đơn giản, dễ rollback;
   - không làm thay đổi scoring silently.
5. Ưu tiên:
   - correctness;
   - idempotency;
   - data integrity;
   - auditability;
   - resource efficiency;
   - maintainability.
6. Không over-engineer.
7. Không chuyển sang microservices/Kubernetes/Kafka/GraphQL nếu không có yêu cầu mới.

---

# 2. Stack bắt buộc

## Frontend

```text
React 19.2
TypeScript
Vite 8.x
Tailwind CSS 4.x
TanStack Query
React Router
```

## Backend

```text
Node.js 24 LTS
NestJS
TypeScript
Drizzle ORM
REST API
OpenAPI/Swagger
```

## Data / Queue

```text
PostgreSQL 18.x
Redis
BullMQ
```

## Deployment

```text
Caddy
Docker Compose
Debian-slim Node image
```

Không thay stack nếu chưa có yêu cầu.

---

# 3. Kiến trúc tổng thể

Dùng **modular monolith**.

Runtime production mặc định:

```text
caddy
api
worker
postgres
redis
```

Không cần:

```text
frontend Node runtime
scheduler container riêng
microservice
Kafka
RabbitMQ
Kubernetes
```

Frontend build thành static assets và được Caddy serve trực tiếp.

Worker xử lý:

- Codeforces sync;
- retry;
- backfill;
- reconciliation;
- lightweight scheduling loop.

PostgreSQL là **source of truth duy nhất**.

Redis chỉ dùng cho:

- BullMQ;
- deduplication;
- global rate limit;
- short cache;
- short-lived coordination/lock.

---

# 4. Các invariant tuyệt đối không được phá

## 4.1. First solve

Mỗi:

```text
(user_id, problem_key)
```

chỉ có **một canonical first solve**.

Mọi duplicate submission sau đó không được sinh reward mới.

## 4.2. Reward idempotency

Một first solve hợp lệ chỉ sinh tối đa:

```text
1 EARN transaction
```

Worker retry 1, 2 hay 10 lần vẫn phải cho cùng kết quả.

## 4.3. Wallet

`REDEEM` không được làm wallet âm trong MVP. `REVERSAL`, `PENALTY` hoặc correction được duyệt có thể làm balance âm nếu user đã tiêu point trước đó.

Redeem phải atomic.

Hai request redeem đồng thời không được cùng tiêu một balance.

## 4.4. Ledger

Point transaction là immutable.

Không UPDATE amount cũ.

Nếu correction:

```text
REVERSAL
ADJUSTMENT
REFUND
```

## 4.5. Season vs Wallet

Không trộn:

```text
Season Score
Wallet Balance
CC_Level
```

Redeem làm giảm Wallet nhưng không giảm Season Score.

## 4.6. Historical backfill

History trước khi tham gia:

```text
được dùng để dựng CC_Level
không sinh CC_Point
```

Re-solve bài cũ sau khi join vẫn không reward.

## 4.7. Reward snapshot

Reward dùng:

```text
CC_Level ngay trước first solve
problem rating snapshot tại thời điểm award
```

Không dùng level hiện tại để tính lại reward lịch sử.

## 4.8. Season event time

Season của một solve dựa trên:

```text
first_solved_at
```

không dựa trên thời gian worker xử lý xong.

## 4.9. Codeforces rate limit

Mọi upstream request Codeforces phải đi qua **một global limiter**.

Mặc định:

```text
1 request / 2200 ms
```

Limiter áp dụng trên **mỗi HTTP request**, không phải chỉ mỗi job.

---

# 5. Công thức scoring bắt buộc

## 5.1. CC_Level

Lấy các unique rated first-solves, sort giảm dần:

\[
D_1 \ge D_2 \ge ... \ge D_n
\]

Tính:

\[
CC_{Calculated}
=
\frac{1}{20}
\sum_{i=1}^{n}
D_i\cdot0.95^{i-1}
\]

Sau đó:

\[
CC_{Level}
=
\max(CC_{Base}, CC_{Calculated})
\]

Default:

```text
CC_Base = 800
```

## 5.2. CC_Point

Với:

```text
D = problem rating snapshot
L = CC_Level trước first solve
```

Tính:

\[
CC_{PointRaw}
=
0.05
+
\frac{29.95}
{1 + e^{-((D-L)-50)/80}}
\]

Sau đó:

\[
CC_{Point}=min(30.00,max(0.05,round(CC_{PointRaw},2)))
\]

Không tự ý đổi formula.

Phải version hóa bằng:

```text
scoring_policy_version
```

---

# 6. Problem identity

Canonical key:

```text
contest:{contestId}:{index}
```

Nếu không có `contestId` nhưng có `problemsetName`:

```text
problemset:{problemsetName}:{index}
```

Không dùng problem name làm unique key.

---

# 7. Quy tắc submission

Chỉ first solve cá nhân, verdict `OK`, problem `PROGRAMMING` mới đủ điều kiện xét skill/reward.

## Rated problem

```text
CC_Level: có
CC_Point: có nếu reward eligible
Streak: có
```

## Unrated problem

```text
CC_Level: không
CC_Point: không
Streak: có thể tính
```

## Team submission

Mặc định:

```text
CC_Level: không
CC_Point: không
First-solve cá nhân: không
```

---

# 8. Database schema cần triển khai

Tạo migrations cho tối thiểu các bảng sau:

```text
users
codeforces_accounts
user_skill_state
organizations
organization_memberships
cf_problems
cf_submissions
user_problem_solves
scoring_policies
point_transactions
user_wallets
seasons
season_user_totals
season_user_snapshots
season_awards
rewards
reward_orders
audit_logs
```

Dùng:

```text
UUID
TIMESTAMPTZ
NUMERIC(12,2) cho point/wallet
JSONB chỉ cho metadata
```

Không dùng float cho tiền/point ledger.

---

# 9. Index/constraint bắt buộc

Tối thiểu:

```text
codeforces_accounts(handle) UNIQUE
user_problem_solves(user_id, problem_key) UNIQUE / PK
cf_submissions(cf_submission_id) PK
organization_memberships(organization_id, user_id) PK
season_user_totals(season_id, user_id) UNIQUE
season_user_snapshots(season_id, user_id) UNIQUE
```

Reward EARN phải có DB uniqueness đủ để retry không duplicate.

Tạo indexes phục vụ:

```text
cf_submissions(user_id, creation_time DESC)
cf_submissions(user_id, cf_submission_id DESC)
user_problem_solves(user_id, first_solved_at DESC)
point_transactions(user_id, created_at DESC)
point_transactions(season_id, user_id, created_at)
season_user_totals(season_id, score DESC)
reward_orders(user_id, created_at DESC)
codeforces_accounts(next_sync_at)
```

---

# 10. Transaction boundary cho first solve

Một rated first solve rewardable phải được xử lý trong một DB transaction logic:

1. Upsert submission.
2. Attempt insert canonical first solve.
3. Nếu conflict:
   - stop reward;
   - không duplicate.
4. Lock/read `user_skill_state`.
5. Capture:
   ```text
   cc_level_before
   ```
6. Tính reward.
7. Insert `EARN` transaction.
8. Update wallet.
9. Update season aggregate.
10. Recompute/update `CC_Level`.
11. Commit.

Nếu fail:

```text
rollback
```

Retry phải an toàn.

---

# 11. Initial backfill

Khi Codeforces account được verify lần đầu:

1. Trong transaction verify, set ngay:
   ```text
   verified_at
   reward_eligible_from = verified_at
   ```
2. Set state:
   ```text
   INITIALIZING
   ```
3. Paginate `user.status`.
4. Upsert submissions.
5. Build canonical first solves.
6. Reconstruct CC_Level.
7. Không tạo historical EARN.
8. Set:
   ```text
   backfill_completed_at
   last_seen_submission_id
   ```
9. Chuyển account sang sync-ready state.

Backfill phải:

- resumable;
- chunked;
- không dùng một transaction khổng lồ.

---

# 12. Incremental sync

Lưu:

```text
last_seen_submission_id
last_sync_at
next_sync_at
```

Mỗi sync:

1. Fetch newest submissions.
2. Re-upsert recent window để reconciliation.
3. Dừng khi gặp checkpoint cũ.
4. Nếu chưa gặp:
   - paginate tiếp.
5. Sort new first-solves:
   ```text
   creation_time ASC
   submission_id ASC
   ```
6. Process deterministic.
7. Chỉ cập nhật checkpoint sau khi DB transaction thành công.

Config mặc định:

```text
SYNC_RECENT_RECONCILE_COUNT=100
```

---

# 13. Codeforces queue

Dùng BullMQ.

Logical work:

```text
cf-sync
```

Có priority:

```text
HIGH:
- on-demand
- recent scheduled sync

LOW:
- initial backfill
- heavy reconciliation
```

Dùng global upstream limiter cho mọi Codeforces HTTP request.

Nếu dùng hai logical queue, phải bảo đảm limiter vẫn là **global cross-queue**.

Không được tạo hai limiter độc lập làm tổng throughput vượt quota.

---

# 14. Job deduplication

Dedup key:

```text
sync:{user_id}
```

Nếu user đã có job:

```text
waiting
active
delayed
retrying
```

thì không enqueue job đồng nghĩa khác.

UI có thể trả:

```text
Đang chờ cập nhật
```

---

# 15. Retry/backoff

Transient errors:

```text
network timeout
5xx/upstream failure
call limit exceeded
Redis transient issue
```

Dùng:

```text
exponential backoff
jitter
bounded retries
```

Không spin retry liên tục.

Không retry vô hạn đối với:

```text
invalid handle
unlinked account
permanent malformed data
```

---

# 16. Scheduler

Không tạo scheduler service riêng trong MVP.

Worker chạy loop:

1. acquire advisory/distributed lock;
2. query:
   ```text
   status=ACTIVE
   next_sync_at <= now()
   ```
3. enqueue batch nhỏ;
4. update scheduling state;
5. release lock;
6. repeat.

State nằm ở PostgreSQL.

Nếu Redis/worker chết, scheduler phải phục hồi được.

---

# 17. Sync cadence

Suggested target:

```text
HOT:  1–2 giờ
WARM: 6 giờ
COLD: 24 giờ
```

Nhưng cadence phải capacity-aware.

Reserve khoảng:

```text
20–30%
```

upstream capacity cho:

```text
on-demand
retry
backfill
reconciliation
```

Không chạy cron sweep toàn bộ user định kỳ.

---

# 18. Account verification

Codeforces handle không được coi là verified chỉ vì user nhập được handle.

MVP trường học:

```text
TEACHER_VERIFIED
ADMIN_VERIFIED
UNVERIFIED
```

Chỉ verified account mới:

```text
reward eligible
leaderboard eligible
scheduled sync
```

---

# 19. Organization / RBAC

Visibility:

```text
PUBLIC
CLOSED
PRIVATE
```

Membership role:

```text
MEMBER
TEACHER
ORG_ADMIN
```

System role:

```text
SYSTEM_ADMIN
```

Authorization bắt buộc enforce ở backend.

Không chỉ hide UI.

---

# 20. Season

Season status:

```text
DRAFT
ACTIVE
CLOSING
CLOSED
```

Mỗi season có:

```text
start_at
end_at
scoring_policy_version
organization_id nullable
```

Season Score mặc định gồm:

```text
EARN
BONUS
PENALTY
REVERSAL
leaderboard-affecting ADJUSTMENT
```

Không gồm:

```text
REDEEM
REFUND
```

---

# 21. Season snapshots

Cuối season lưu:

```text
cc_level_start
cc_level_end
cc_level_growth

season_score
qualifying_solves
active_days
longest_streak
max_challenge_delta

final_rank
closed_at
```

Sau `CLOSED`:

- không sửa snapshot thông thường;
- correction phải qua admin workflow + audit.

---

# 22. Monthly awards

Support:

```text
TOP_SCORE
MOST_IMPROVED
MOST_CONSISTENT
CHALLENGE
CUSTOM
```

Tie-break:

## TOP_SCORE

```text
1. Season Score DESC
2. qualifying_solves DESC
3. CC_Level_end DESC
4. reached_score_at ASC
```

## MOST_IMPROVED

```text
1. cc_level_growth DESC
2. season_score DESC
3. qualifying_solves DESC
```

## MOST_CONSISTENT

```text
1. active_days DESC
2. longest_streak DESC
3. qualifying_solves DESC
```

Monthly award không mặc định trừ wallet.

---

# 23. Reward Store

Redeem flow trong một DB transaction:

1. Lock wallet hoặc conditional atomic update.
2. Check balance.
3. Check/lock stock nếu có.
4. Create order.
5. Insert `REDEEM`.
6. Decrement wallet.
7. Commit.

Nếu reject/cancel sau khi đã trừ:

```text
REFUND
```

Không sửa transaction cũ.

---

# 24. Streak

Qualifying day:

- individual;
- verdict OK;
- first solve;
- programming problem.

Unrated problem có thể tính streak.

Dùng timezone:

```text
user.timezone
fallback organization.timezone
fallback Asia/Ho_Chi_Minh
```

Không tính streak trực tiếp bằng UTC date.

---

# 25. Tag analytics

MVP có thể ưu tiên đơn giản:

```text
unique solved count by tag
average rating
max rating
```

Nếu triển khai Tag Score:

\[
TagScore
=
\frac{1}{10}
\sum_{i=1}^{n}
D_i\cdot0.9^{i-1}
\]

Tag analytics không ảnh hưởng reward.

---

# 26. REST API tối thiểu

## User

```text
GET  /me
GET  /me/dashboard
GET  /me/activity
POST /me/sync
GET  /me/sync-status
```

## Leaderboard

```text
GET /leaderboards
```

Query:

```text
organization_id
season_id
page
page_size
```

## Rewards

```text
GET  /rewards
POST /rewards/:id/redeem
GET  /me/reward-orders
```

## Organization

```text
GET  /organizations/:id
GET  /organizations/:id/members
POST /organizations
POST /organizations/:id/members
PATCH /organizations/:id/members/:userId
```

## Admin scoring

```text
POST /admin/users/:id/bonus
POST /admin/users/:id/penalty
POST /admin/users/:id/adjustment
POST /admin/users/:id/recalibrate-base
```

Mọi admin scoring command phải có:

```text
reason
```

và audit log.

---

# 27. Frontend pages

Tối thiểu:

```text
Login/Auth
Dashboard
Leaderboard
Reward Store
Reward Order History
Organization View
Admin/Teacher Member Management
Admin Reward Management
Admin Award/Adjustment UI
```

Dashboard hiển thị:

```text
CC_Level
Wallet Balance
Season Score
Current Streak
Longest Streak
Qualifying Solves
Tag Analytics
Recent Activity
Recent Transactions
Last Sync Time
Sync Status
```

---

# 28. Frontend performance

Bắt buộc:

- route-level lazy loading;
- pagination;
- không tải toàn bộ submission history;
- TanStack Query cho server state;
- fingerprinted static assets cache lâu;
- `index.html` cache ngắn/no-cache.

Không đưa chart library vào initial bundle nếu route đầu không cần.

---

# 29. Cache

MVP chỉ cache tối thiểu.

Suggested:

```text
public leaderboard: 30s
reward catalog:      60s
```

Không cache:

```text
wallet write path
first-solve uniqueness
authorization-sensitive write state
```

---

# 30. Caddy

Caddy phải:

1. serve React static assets;
2. TLS/HTTPS;
3. reverse proxy `/api/*` tới NestJS API;
4. static asset caching hợp lý;
5. không expose PostgreSQL/Redis.

---

# 31. Docker

Yêu cầu:

- multi-stage build;
- Node 24 Debian slim;
- non-root;
- healthcheck;
- graceful shutdown;
- production env config;
- no secret baked into image.

Compose services:

```text
caddy
api
worker
postgres
redis
```

---

# 32. PostgreSQL connection pool

Bắt đầu nhỏ:

```text
API pool:    5–10
Worker pool: 3–5
```

Không thêm PgBouncer ở MVP nếu metrics chưa cần.

---

# 33. Observability

Tối thiểu:

```text
structured JSON logs
health/live
health/ready
error tracking
uptime monitoring
queue status/metrics
basic DB/host monitoring
```

Metrics quan trọng:

```text
cf_api_requests_total
cf_api_failures_total
cf_call_limit_exceeded_total
sync_jobs_waiting
sync_jobs_failed
sync_oldest_job_age
sync_duration
sync_new_submissions
sync_duplicate_jobs_prevented

reward_earn_transactions
reward_reversals
redeem_success
redeem_rejected_insufficient_balance

db_transaction_failures
wallet_reconciliation_mismatch
```

Không bắt buộc thêm Prometheus/Grafana trong MVP nếu resource hạn chế.

---

# 34. Backup

PostgreSQL:

- automated backup;
- retention;
- restore test định kỳ;
- backup nên nằm ngoài cùng VPS nếu có thể.

Redis mất không được làm mất dữ liệu nghiệp vụ.

---

# 35. Security

Bắt buộc:

- HTTPS;
- secure auth/session;
- CSRF protection nếu cookie auth;
- modern password hash nếu tự quản lý password;
- rate limit login/sync/redeem;
- validate input;
- parameterized SQL/ORM;
- Redis/PostgreSQL private;
- least privilege;
- secret qua env/secret mechanism;
- dependency scanning;
- admin audit;
- non-root container.

---

# 36. Test bắt buộc

## CC_Level property tests

- permutation input không đổi result;
- duplicate problem không đổi result;
- unrated problem không đổi result;
- thêm first solve hợp lệ không làm level giảm trong normal path;
- 10/20/40/60/90 bài cùng rating khớp công thức.

## Reward property tests

```text
delta1 < delta2
→ reward(delta1) < reward(delta2)

reward >= 0.05
reward <= 30.00
```

Regression:

```text
-500
-300
-200
-100
0
+100
+200
+300
+500
```

## Idempotency

Cùng submission process:

```text
1 lần
2 lần
10 lần
```

phải vẫn là:

```text
1 first solve
1 EARN
1 wallet increment
1 season increment
```

## Concurrent redeem

Hai request song song với tổng cost > balance:

```text
tối đa 1 request thành công
wallet không âm
```

## Backfill

- lịch sử dựng level;
- lịch sử không tạo EARN;
- re-solve bài cũ không reward;
- solve mới sau eligibility reward đúng 1 lần.

## Season boundary

Test:

```text
start_at - 1ms
start_at
end_at - 1ms
end_at
```

## Authorization

Test đầy đủ:

```text
PUBLIC
CLOSED
PRIVATE
```

với:

```text
guest
member
teacher
org admin
system admin
```

## Crash/retry

Simulate worker crash:

- trước DB commit;
- sau DB commit;
- trước checkpoint;
- sau checkpoint.

Kết quả cuối phải idempotent.

---

# 37. Cách Codex phải làm việc

Không code toàn hệ thống trong một lần.

Mỗi phase:

1. đọc section PRD liên quan;
2. inspect repository;
3. lập plan ngắn;
4. implement;
5. viết/chỉnh test;
6. chạy:
   ```text
   typecheck
   lint
   unit tests
   integration tests liên quan
   ```
7. self-review diff;
8. báo:
   - files changed;
   - assumptions;
   - tests run;
   - remaining risks;
   - next recommended task.

Không được bỏ qua test để “tiết kiệm thời gian”.

---

# 38. Thứ tự triển khai

## Phase 0 — Repository/bootstrap

Làm:

- monorepo hoặc workspace hợp lý;
- frontend;
- backend;
- shared config/types nếu cần;
- lint;
- formatter;
- TypeScript strict;
- env validation;
- Docker Compose dev;
- basic CI;
- health endpoints.

**Done khi:**

```text
frontend chạy
api chạy
worker chạy
postgres kết nối
redis kết nối
CI xanh
```

---

## Phase 1 — Database foundation

Làm:

- Drizzle setup;
- migrations;
- tất cả core tables;
- indexes;
- constraints;
- seed scoring policy v2.0.

**Done khi:**

- migration fresh DB chạy được;
- migration rollback/forward strategy rõ;
- schema tests pass;
- constraints được integration test.

---

## Phase 2 — Auth/User/Organization/RBAC

Làm:

- user auth;
- users;
- organizations;
- memberships;
- role checks;
- visibility policies;
- admin/teacher authorization.

**Done khi:**

authorization matrix test pass.

---

## Phase 3 — Codeforces account verification

Làm:

- link handle;
- unique handle;
- verification status;
- teacher/admin verify;
- account sync states.

**Done khi:**

unverified account không được reward/leaderboard eligibility.

---

## Phase 4 — Codeforces client + queue infrastructure

Làm:

- typed CF client;
- BullMQ;
- global limiter;
- retry/backoff;
- dedup;
- HIGH/LOW priority;
- metrics/logging.

**Done khi:**

- không có code path gọi CF ngoài client/worker;
- rate-limit integration test pass;
- duplicate sync job prevented.

---

## Phase 5 — Submission ingestion

Làm:

- problem normalization;
- problem canonical key;
- submission upsert;
- participant/team handling;
- recent reconciliation window.

**Done khi:**

same CF submission ingest nhiều lần vẫn chỉ có một DB row.

---

## Phase 6 — First solve engine

Làm:

- `user_problem_solves`;
- first-solve detection;
- unique constraint;
- deterministic chronological processing.

**Done khi:**

duplicate/re-submit không tạo first-solve mới.

---

## Phase 7 — CC_Level engine

Làm:

- pure scoring function;
- persistence;
- default base 800;
- teacher recalibration;
- scoring policy version.

**Done khi:**

property/regression tests pass.

---

## Phase 8 — Backfill

Làm:

- paginated backfill;
- resumable chunks;
- reward eligibility cutoff;
- build first-solves;
- build CC_Level;
- checkpoint.

**Done khi:**

historical solves never create EARN.

---

## Phase 9 — CC_Point / Ledger / Wallet

Làm:

- sigmoid reward;
- immutable ledger;
- EARN uniqueness;
- wallet;
- transaction boundary;
- reversal model.

**Done khi:**

retry 10 lần vẫn chỉ reward một lần.

---

## Phase 10 — Seasons

Làm:

- season entity;
- event-time assignment;
- season aggregates;
- start/end;
- ACTIVE/CLOSING/CLOSED.

**Done khi:**

boundary tests pass.

---

## Phase 11 — Monthly snapshots and awards

Làm:

- season_user_snapshots;
- level growth;
- active days;
- longest streak;
- max challenge delta;
- final rank;
- award records.

**Done khi:**

closed season reproducible và snapshots stable.

---

## Phase 12 — Reward Store

Làm:

- rewards;
- stock;
- reward orders;
- atomic redeem;
- reject/cancel refund;
- admin management.

**Done khi:**

concurrent redeem test pass.

---

## Phase 13 — Scheduler

Làm:

- `next_sync_at`;
- HOT/WARM/COLD;
- capacity-aware enqueue;
- scheduler lock;
- no cron sweep.

**Done khi:**

restart worker không mất scheduling state.

---

## Phase 14 — Dashboard / Leaderboard UI

Làm:

- personal dashboard;
- leaderboard filters;
- season;
- organization;
- sync action/status;
- activity timeline;
- point history.

**Done khi:**

critical UI states hiển thị đúng và không cần reload toàn trang.

---

## Phase 15 — Streak / Tag Analytics

Làm:

- timezone-aware streak;
- longest/current;
- tag statistics;
- radar/chart nếu cần.

**Done khi:**

timezone boundary tests pass.

---

## Phase 16 — Admin/Teacher UI

Làm:

- verify handle;
- manage member;
- bonus/penalty/adjustment;
- reward management;
- award display;
- audit visibility.

**Done khi:**

mọi privileged command backend enforce đúng role.

---

## Phase 17 — Reconciliation/rejudge

Làm:

- recent re-upsert;
- invalid reward detection;
- REVERSAL;
- first valid solve re-evaluation;
- skill recompute;
- audit reason.

**Done khi:**

correction không sửa transaction cũ.

---

## Phase 18 — Deployment

Làm:

- production Dockerfiles;
- Caddy;
- compose production;
- health checks;
- graceful shutdown;
- non-root;
- backup script/runbook.

**Done khi:**

staging deploy thành công từ clean machine.

---

## Phase 19 — Production hardening

Làm:

- security review;
- race-condition review;
- migration review;
- load test;
- backup restore test;
- error handling audit;
- metrics;
- alert thresholds.

**Done khi:**

production checklist trong PRD pass.

---

# 39. Prompt format cho từng task Codex

Mỗi task nên được giao theo format:

```text
Task:
<việc cần làm>

Read first:
- CODEX_IMPLEMENTATION_BRIEF.md
- codeforces-gamification-prd-v2.md
- <relevant files/modules>

Scope:
<modules được phép sửa>

Acceptance criteria:
1. ...
2. ...
3. ...

Must preserve:
- idempotency
- transaction invariants
- scoring versioning
- existing API compatibility nếu có

Tests required:
- ...
- ...

Non-goals:
- ...
```

---

# 40. Reasoning/model recommendation

## Core implementation

```text
GPT-5.6 Sol
Reasoning: High
```

Dùng cho:

- DB schema;
- sync;
- scoring;
- ledger;
- wallet;
- season;
- authorization;
- reconciliation.

## Routine implementation

```text
GPT-5.6 Terra
Reasoning: Medium
```

Dùng cho:

- frontend;
- CRUD;
- DTO;
- styling;
- repetitive tests;
- local refactor.

## Critical review

```text
GPT-5.6 Sol
Reasoning: Extra High
```

Dùng cho:

- race conditions;
- security;
- migrations;
- production-readiness;
- scoring correctness;
- wallet correctness;
- final architecture review.

---

# 41. Definition of Done cho một pull request

Một task chỉ được coi là xong nếu:

- [ ] Code đúng scope.
- [ ] Không làm đổi business rule ngoài yêu cầu.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Unit tests pass.
- [ ] Relevant integration tests pass.
- [ ] Migration được review nếu có.
- [ ] Không có secret trong repo.
- [ ] Không duplicate business event.
- [ ] Error path được xử lý.
- [ ] Logs đủ để debug.
- [ ] OpenAPI cập nhật nếu API đổi.
- [ ] README/runbook cập nhật nếu cần.
- [ ] Codex tự review diff trước khi kết thúc.

---

# 42. Production checklist cuối

- [ ] Global Codeforces rate limiter hoạt động trên từng request.
- [ ] Không có direct CF call ngoài approved client.
- [ ] First solve DB uniqueness.
- [ ] EARN DB uniqueness.
- [ ] Retry không duplicate point.
- [ ] Historical backfill không reward.
- [ ] Wallet redeem atomic.
- [ ] REDEEM không làm wallet âm; correction âm tuân thủ ADR 0001.
- [ ] Ledger immutable.
- [ ] Season event-time đúng.
- [ ] Season snapshot/finalize đúng.
- [ ] Monthly awards lưu độc lập.
- [ ] Private organization authorization test pass.
- [ ] Admin scoring có reason/audit.
- [ ] Rejudge dùng reversal.
- [ ] Backup PostgreSQL chạy.
- [ ] Restore test thành công.
- [ ] Redis loss không mất source-of-truth data.
- [ ] Caddy HTTPS hoạt động.
- [ ] PostgreSQL/Redis không public.
- [ ] Container non-root.
- [ ] Staging smoke test pass.
- [ ] Monitoring/alerts tối thiểu hoạt động.

---

# 43. Chỉ dẫn cuối cho Codex

Không cố “thông minh hóa” hệ thống bằng công nghệ mới không cần thiết.

Nếu có hai phương án ngang nhau, ưu tiên:

```text
simple
explicit
transaction-safe
testable
observable
reversible
```

Mọi correctness quan trọng phải dựa vào:

```text
PostgreSQL constraints
+
transactions
+
deterministic business logic
```

không dựa vào “worker chắc sẽ chỉ chạy một lần”.

Hãy xây hệ thống theo từng phase nhỏ, chạy test thường xuyên và giữ repository luôn ở trạng thái có thể deploy.

**End of Codex Implementation Brief**
