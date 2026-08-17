# OWNER PLAYBOOK — QUY TRÌNH TRIỂN KHAI VỚI CODEX
## Codeforces Gamification Tracker

> **Dùng cùng:**
> - `codeforces-gamification-prd-v2.md`
> - `CODEX_IMPLEMENTATION_BRIEF.md`
>
> **Vai trò của file này:** hướng dẫn chủ dự án từng bước giao việc cho Codex, kiểm tra kết quả, nghiệm thu và chuyển sang phase tiếp theo.

---

# 1. Nguyên tắc làm việc

Không yêu cầu Codex:

```text
"Hãy xây toàn bộ hệ thống."
```

Thay vào đó:

```text
1 phase
→ implement
→ test
→ review
→ commit
→ nghiệm thu
→ phase tiếp theo
```

Mỗi phase phải giữ repository ở trạng thái:

```text
build được
test được
deploy được
không phá phase trước
```

---

# 2. Ba file nên đặt ở root repository

```text
/codeforces-gamification-prd-v2.md
/CODEX_IMPLEMENTATION_BRIEF.md
/OWNER_CODEX_PLAYBOOK.md
```

Vai trò:

```text
PRD
→ hệ thống phải làm gì

IMPLEMENTATION_BRIEF
→ Codex phải xây như thế nào

OWNER_PLAYBOOK
→ bạn phải giao việc và kiểm tra như thế nào
```

---

# 3. Model / Reasoning nên dùng

## Công việc thông thường

```text
GPT-5.6 Terra
Reasoning: Medium
```

Phù hợp:

- UI;
- CRUD;
- form;
- DTO;
- styling;
- unit test đơn giản;
- documentation;
- refactor nhỏ.

## Công việc backend/correctness quan trọng

```text
GPT-5.6 Sol
Reasoning: High
```

Bắt buộc ưu tiên cho:

- database schema;
- migrations;
- scoring;
- first solve;
- wallet;
- ledger;
- BullMQ;
- Codeforces sync;
- seasons;
- RBAC;
- concurrency.

## Review quan trọng

```text
GPT-5.6 Sol
Reasoning: Extra High
```

Dùng khi:

- review migration lớn;
- review race condition;
- security audit;
- wallet correctness;
- idempotency audit;
- production readiness;
- lỗi production khó.

Nếu chỉ muốn một cấu hình duy nhất:

```text
GPT-5.6 Sol + High
```

---

# 4. Quy trình chuẩn cho MỌI phase

Bạn luôn làm theo vòng lặp:

```text
A. Giao task
B. Codex implement
C. Codex chạy test
D. Codex self-review
E. Bạn đọc báo cáo
F. Nếu critical → mở review task riêng
G. Commit/tag
H. Chuyển phase
```

Không chuyển phase khi:

- tests fail;
- migration chưa rõ;
- Codex báo assumption quan trọng chưa xác nhận;
- có TODO liên quan correctness;
- có workaround tạm chưa được ghi lại.

---

# 5. Prompt mở đầu repository

Sau khi tạo repo và copy ba file vào root, dùng:

```text
Đọc kỹ toàn bộ 3 file ở root repository:

1. codeforces-gamification-prd-v2.md
2. CODEX_IMPLEMENTATION_BRIEF.md
3. OWNER_CODEX_PLAYBOOK.md

Chưa viết code.

Hãy:
1. Khảo sát repository hiện tại.
2. Tóm tắt kiến trúc và các invariant quan trọng mà bạn phải giữ.
3. Xác định repo đang ở phase nào.
4. Liệt kê những gì còn thiếu để bắt đầu Phase 0.
5. Đề xuất kế hoạch Phase 0 theo các bước nhỏ.
6. Chỉ ra mọi assumption hoặc mâu thuẫn giữa code hiện tại và tài liệu.

Không implement cho đến khi hoàn tất phân tích này.
```

### Bạn kiểm tra

Codex phải nhắc được tối thiểu:

- PostgreSQL là source of truth;
- first solve unique;
- reward idempotent;
- ledger immutable;
- wallet khác season score;
- historical backfill không reward;
- reward dùng level before solve;
- Codeforces global limiter;
- modular monolith;
- 5 container production.

Nếu không nắm được các ý này, chưa cho code.

---

# 6. PHASE 0 — Repository / Bootstrap

## Model

```text
GPT-5.6 Sol
High
```

## Prompt

```text
Đọc:
- codeforces-gamification-prd-v2.md
- CODEX_IMPLEMENTATION_BRIEF.md
- OWNER_CODEX_PLAYBOOK.md

Triển khai CHỈ Phase 0 — Repository/bootstrap.

Scope:
- frontend React + TypeScript + Vite
- backend NestJS
- worker process
- PostgreSQL dev service
- Redis dev service
- Docker Compose development
- TypeScript strict
- lint/format
- env validation
- health/live
- health/ready
- basic CI
- project scripts và README tối thiểu

Không làm:
- business tables
- auth
- Codeforces integration
- scoring
- wallet
- seasons

Yêu cầu:
1. Giữ modular monolith.
2. Không thêm framework/service ngoài stack đã chốt nếu không thực sự cần.
3. Frontend và backend phải chạy độc lập trong dev.
4. Worker phải boot được và kết nối Redis/PostgreSQL.
5. CI phải chạy typecheck + lint + tests hiện có.

Trước khi kết thúc:
- chạy typecheck
- chạy lint
- chạy unit tests
- chạy build frontend/backend
- xác nhận Docker Compose boot được
- self-review diff

Báo cáo:
1. Files changed
2. Commands/tests đã chạy và kết quả
3. Assumptions
4. Technical debt nếu có
5. Những gì còn thiếu để đạt Definition of Done Phase 0
6. Không làm sang Phase 1
```

## Bạn nghiệm thu

Phải đạt:

```text
frontend boot
API boot
worker boot
PostgreSQL reachable
Redis reachable
health checks OK
CI xanh
build pass
```

Sau đó commit:

```text
chore: bootstrap project architecture
```

---

# 7. PHASE 1 — Database Foundation

## Model

```text
GPT-5.6 Sol
High
```

Sau implementation nên có một lượt:

```text
GPT-5.6 Sol
Extra High
```

để review schema.

## Prompt implement

```text
Triển khai CHỈ Phase 1 — Database foundation.

Đọc kỹ schema và invariant trong PRD/Implementation Brief.

Dùng:
- PostgreSQL 18.x
- Drizzle ORM
- SQL migrations rõ ràng

Tạo core schema cho:
- users
- codeforces_accounts
- user_skill_state
- organizations
- organization_memberships
- cf_problems
- cf_submissions
- user_problem_solves
- scoring_policies
- point_transactions
- user_wallets
- seasons
- season_user_totals
- season_user_snapshots
- season_awards
- rewards
- reward_orders
- audit_logs

Bắt buộc:
- đúng PK/FK
- unique constraints
- partial/indexes quan trọng
- NUMERIC cho point/wallet
- TIMESTAMPTZ
- versioned scoring policy
- seed scoring policy v2.0
- CC_Base mặc định 800

Chưa implement business services/API.

Viết integration tests cho các constraint critical:
- duplicate first solve phải fail
- duplicate CF submission phải fail
- duplicate membership phải fail
- duplicate season snapshot phải fail
- wallet type dùng numeric, không float
- EARN uniqueness có cơ chế DB-level

Chạy:
- migration trên DB sạch
- typecheck
- lint
- tests
- migration/schema self-review

Báo cáo mọi quyết định schema không ghi rõ trong tài liệu.
Dừng ở Phase 1.
```

## Prompt review schema

```text
Hãy review Phase 1 như một database architect.

Không sửa code trước.

Kiểm tra đặc biệt:
- idempotency constraints
- EARN uniqueness
- first-solve uniqueness
- foreign keys
- delete behavior
- point/wallet numeric precision
- season constraints
- indexes
- expected query patterns
- migration safety
- khả năng audit/rebuild

Tìm:
- race condition có thể xảy ra chỉ vì schema thiếu constraint
- index thừa
- index thiếu
- field nullable sai
- cascade delete nguy hiểm
- business invariant chưa được DB enforce

Phân loại:
CRITICAL / HIGH / MEDIUM / LOW

Nếu có CRITICAL/HIGH, đề xuất patch nhỏ nhất.
```

## Commit

```text
feat: add core database schema
```

---

# 8. PHASE 2 — Auth / User / Organization / RBAC

## Model

```text
GPT-5.6 Sol + High
```

## Prompt

```text
Triển khai CHỈ Phase 2 — Auth/User/Organization/RBAC.

Yêu cầu:
- authentication an toàn
- user lifecycle
- organization hierarchy
- memberships
- PUBLIC/CLOSED/PRIVATE visibility
- MEMBER/TEACHER/ORG_ADMIN
- SYSTEM_ADMIN
- backend authorization guards/policies
- audit các privileged action cần thiết

Không chỉ hide UI; authorization bắt buộc enforce ở API.

Viết integration tests cho authorization matrix trong Implementation Brief.

Không làm Codeforces sync/scoring.

Trước khi kết thúc:
- typecheck
- lint
- unit/integration tests
- self-review security/authorization
- báo endpoint mới
- báo role matrix thực tế

Dừng ở Phase 2.
```

## Nghiệm thu

Bạn yêu cầu Codex chứng minh bằng tests:

```text
guest không xem private
member chỉ xem private org của mình
teacher không tự thành system admin
org admin chỉ quản lý đúng org
system admin được override theo policy
```

---

# 9. PHASE 3 — Codeforces Account Verification

## Prompt

```text
Triển khai CHỈ Phase 3 — Codeforces account verification.

Yêu cầu:
- link Codeforces handle
- handle unique
- verification status:
  UNVERIFIED
  TEACHER_VERIFIED
  ADMIN_VERIFIED
- teacher/admin verification flow
- account sync state
- reward eligibility rule
- leaderboard eligibility rule

Invariant:
Nhập được handle KHÔNG đồng nghĩa verified.

Unverified account:
- không reward
- không leaderboard eligible
- không scheduled sync production

Viết tests đầy đủ.
Không implement full Codeforces sync ở phase này.
```

---

# 10. PHASE 4 — Codeforces Client / BullMQ Infrastructure

## Model

```text
GPT-5.6 Sol + High
```

Sau đó review critical bằng Extra High.

## Prompt implement

```text
Triển khai CHỈ Phase 4 — Codeforces client và queue infrastructure.

Yêu cầu:
- typed Codeforces API client
- central request path
- BullMQ
- job deduplication
- retry/backoff + jitter
- HIGH/LOW priority
- global upstream rate limit
- metrics/logging
- graceful worker shutdown

CRITICAL:
Rate limiter phải áp dụng trên MỖI HTTP REQUEST gửi tới Codeforces.

Default:
1 request / 2200 ms

Không được thiết kế:
1 job = 1 limiter slot
nếu một job có thể paginate nhiều request.

Mọi Codeforces request trong repository phải đi qua approved client/limiter.

Viết tests chứng minh:
- nhiều worker vẫn không vượt global rate
- duplicate sync job bị dedup
- transient error retry
- permanent error không retry vô hạn

Không implement scoring.
```

## Prompt review

```text
Audit Codeforces queue/rate limiting ở mức Extra High.

Hãy tìm:
- cách bypass limiter
- cross-queue rate leak
- pagination vượt rate
- duplicate jobs
- retry storm
- starvation LOW priority
- deadlock/stuck jobs
- behavior khi Redis restart
- graceful shutdown bug

Không chỉ đọc config; trace code path thực tế từ enqueue tới HTTP request.
```

---

# 11. PHASE 5 — Submission Ingestion

## Prompt

```text
Triển khai CHỈ Phase 5 — Codeforces submission ingestion.

Yêu cầu:
- normalize Problem
- canonical problem_key
- upsert cf_problems
- upsert cf_submissions
- verdict
- participant type/team handling
- observed rating snapshot metadata
- recent reconciliation window

Canonical key:
contest:{contestId}:{index}

fallback:
problemset:{problemsetName}:{index}

Không dùng problem name làm identity.

Test:
- ingest cùng submission nhiều lần → 1 row
- problem rename không tạo problem mới nếu key giống
- team submission được nhận diện đúng
- unrated problem được lưu đúng

Không làm reward.
```

---

# 12. PHASE 6 — First Solve Engine

## Model

```text
GPT-5.6 Sol + High
```

## Prompt

```text
Triển khai CHỈ Phase 6 — canonical first-solve engine.

Invariant:
(user_id, problem_key) chỉ có 1 canonical first solve.

Yêu cầu:
- detect first individual OK solve
- deterministic order
- DB unique constraint là correctness boundary
- duplicate/resubmit không sinh first solve mới
- team solve không tạo personal first solve
- unrated first solve vẫn có thể tồn tại để phục vụ streak

Viết concurrency/idempotency tests:
- cùng problem được xử lý song song
- nhiều submission OK cho cùng problem
- retry cùng batch

Kết quả cuối phải deterministic.
```

---

# 13. PHASE 7 — CC_Level Engine

## Model

```text
GPT-5.6 Sol + High
```

## Prompt

```text
Triển khai CHỈ Phase 7 — CC_Level engine.

Công thức chính xác:

CC_Calculated =
(1/20) * sum(D_i * 0.95^(i-1))

với D_i:
- unique
- rated
- first solves
- sort giảm dần

CC_Level = max(CC_Base, CC_Calculated)

Default CC_Base = 800.

Yêu cầu:
- scoring function phải pure/deterministic
- policy versioning
- persist user_skill_state
- recalibrate CC_Base qua privileged flow
- không dùng float sai precision nếu ảnh hưởng deterministic output

Tests:
- permutation invariant
- duplicate problem invariant
- unrated no effect
- monotonic normal-path
- 10/20/40/60/90 same-rating cases
- các simulation trong PRD section 36

Không implement CC_Point.
```

## Bạn kiểm tra thủ công

Yêu cầu Codex in kết quả test cho:

```text
15 bài/mức 800→1300
≈ 1207.61

16 bài/mức 1500→1900 với base 1500
≈ 1799.56
```

---

# 14. PHASE 8 — Historical Backfill

## Prompt

```text
Triển khai CHỈ Phase 8 — initial historical backfill.

Yêu cầu:
- paginate user.status
- chunked/resumable
- persist checkpoint
- build submissions
- build first-solves
- reconstruct CC_Level
- xác nhận reward_eligible_from đã được set atomically từ lúc verify, trước khi enqueue backfill
- set backfill_completed_at
- set last_seen_submission_id
- INITIALIZING state trong quá trình chạy

CRITICAL:
Historical solves KHÔNG tạo EARN.

Re-solve một bài đã solve trước reward_eligible_from cũng KHÔNG reward.

Test:
- crash giữa backfill
- resume
- duplicate page
- historical rated solves update level
- historical solve creates zero EARN
- future new solve becomes eligible
```

---

# 15. PHASE 9 — CC_Point / Ledger / Wallet

## Model

```text
GPT-5.6 Sol + High
```

Sau đó:

```text
GPT-5.6 Sol + Extra High
```

review bắt buộc.

## Prompt implement

```text
Triển khai CHỈ Phase 9 — reward engine, immutable ledger và wallet.

Reward formula:

CC_PointRaw =
0.05 + 29.95 / (1 + exp(-((D-L)-50)/80))

CC_Point = round(CC_PointRaw, 2)

D = rating snapshot
L = CC_Level ngay trước first solve

Transaction flow phải atomic:
1. canonical first solve
2. lock/read skill state
3. capture cc_level_before
4. calculate reward
5. insert unique EARN
6. increment wallet
7. update relevant aggregate nếu đã có
8. update CC_Level
9. commit

Invariant:
- retry không duplicate EARN
- ledger immutable
- wallet balance và ledger không lệch
- historical solve không reward

Viết concurrency tests và crash-point tests.

Regression reward deltas:
-500,-300,-200,-100,0,+100,+200,+300,+500

Không làm Reward Store.
```

## Prompt audit

```text
Audit Phase 9 ở Extra High.

Mục tiêu: tìm bất kỳ cách nào làm:
- duplicate EARN
- wallet tăng 2 lần
- ledger/wallet lệch
- dùng sai CC_Level snapshot
- historical solve được reward
- retry sau commit gây duplicate
- concurrent processing phá invariant

Trace transaction và DB constraints thực tế.

Nếu phát hiện lỗi, ưu tiên fix bằng constraint/transaction trước khi thêm application lock.
```

---

# 16. PHASE 10 — Seasons

## Prompt

```text
Triển khai CHỈ Phase 10 — seasons.

Yêu cầu:
- DRAFT/ACTIVE/CLOSING/CLOSED
- start_at/end_at
- event-time assignment
- season_user_totals
- Season Score
- leaderboard-affecting transaction policy

CRITICAL:
Season assignment dùng first_solved_at,
KHÔNG dùng processing time.

Test boundary:
start_at - 1ms
start_at
end_at - 1ms
end_at

Redeem/Refund không làm giảm Season Score.
```

---

# 17. PHASE 11 — Monthly Snapshot / Awards

## Prompt

```text
Triển khai CHỈ Phase 11 — monthly/season snapshot và awards.

Snapshot fields:
- cc_level_start
- cc_level_end
- cc_level_growth
- season_score
- qualifying_solves
- active_days
- longest_streak
- max_challenge_delta
- final_rank
- closed_at

Awards:
- TOP_SCORE
- MOST_IMPROVED
- MOST_CONSISTENT
- CHALLENGE
- CUSTOM

Implement tie-break đúng PRD.

Season close:
ACTIVE
→ CLOSING
→ reconciliation grace
→ snapshot
→ rank
→ awards
→ CLOSED

Sau CLOSED:
không mutate snapshot bình thường.

Viết deterministic tests.
```

---

# 18. PHASE 12 — Reward Store

## Model

```text
GPT-5.6 Sol + High
```

## Prompt

```text
Triển khai CHỈ Phase 12 — Reward Store.

Yêu cầu:
- reward catalog
- cost
- optional stock
- reward orders
- REQUESTED/APPROVED/FULFILLED/REJECTED/CANCELLED
- atomic redeem
- REFUND khi reject/cancel thích hợp

Concurrent redeem:
nếu hai request tổng cost > wallet,
tối đa một request được thành công.

Stock cũng phải concurrency-safe.

Không sửa transaction cũ.
```

---

# 19. PHASE 13 — Adaptive Scheduler

## Prompt

```text
Triển khai CHỈ Phase 13 — adaptive scheduler.

Không tạo scheduler service riêng.

Worker scheduling loop:
- acquire distributed/advisory lock
- query due accounts
- enqueue small batch
- next_sync_at
- release
- repeat

Cadence target:
HOT 1–2h
WARM 6h
COLD 24h

Phải capacity-aware.

Reserve upstream budget cho:
- on-demand
- retry
- backfill
- reconciliation

Không cron sweep toàn bộ users.

Test restart/recovery và multi-worker scheduler lock.
```

---

# 20. PHASE 14 — Dashboard / Leaderboard UI

## Model

```text
GPT-5.6 Terra + Medium
```

Backend/API changes critical thì chuyển Sol + High.

## Prompt

```text
Triển khai CHỈ Phase 14 — Dashboard và Leaderboard UI.

Dashboard:
- CC_Level
- Wallet
- Season Score
- Current/Longest Streak
- Qualifying Solves
- recent activity
- recent transactions
- last sync
- sync status

Leaderboard:
- organization filter
- season filter
- pagination
- rank
- display_name
- CC_Level
- Season Score
- solved
- streak

Requirements:
- responsive
- dark mode
- TanStack Query
- loading/error/empty states
- route lazy loading
- không fetch full history
- respect privacy/authorization

Không redesign business logic.
```

---

# 21. PHASE 15 — Streak / Tag Analytics

## Prompt

```text
Triển khai CHỈ Phase 15 — streak và tag analytics.

Streak:
- first solve
- individual
- OK
- timezone aware
- unrated có thể tính
- resubmit không tính

Timezone fallback:
user
→ organization
→ Asia/Ho_Chi_Minh

Tag analytics MVP:
- unique solved count
- average rating
- max rating

Chỉ thêm weighted Tag Score nếu PRD yêu cầu và tests rõ.

Test DST/timezone/date boundary phù hợp.
```

---

# 22. PHASE 16 — Admin / Teacher UI

## Prompt

```text
Triển khai CHỈ Phase 16 — Admin/Teacher UI.

UI cho:
- verify CF handle
- manage organization members
- roles
- CC_Base recalibration
- bonus
- penalty
- adjustment
- reward management
- awards
- audit visibility

Mọi privileged API đã phải enforce backend.

UI không được tự quyết authorization.

Mọi scoring adjustment phải có reason.
```

---

# 23. PHASE 17 — Reconciliation / Rejudge

## Model

```text
GPT-5.6 Sol + High
```

Review Extra High.

## Prompt

```text
Triển khai CHỈ Phase 17 — reconciliation/rejudge.

Yêu cầu:
- recent submissions re-upsert
- detect previously rewarded solve becoming invalid
- immutable REVERSAL
- find next valid first solve nếu có
- recompute skill state
- audit reason
- preserve deterministic history

Không UPDATE/delete EARN để "sửa nhanh".

Viết tests cho:
- OK → invalid
- first solve invalid, later OK exists
- reversal wallet effect
- season effect
- closed season correction workflow
```

---

# 24. PHASE 18 — Production Deployment

## Model

```text
GPT-5.6 Sol + High
```

## Prompt

```text
Triển khai CHỈ Phase 18 — production deployment.

Yêu cầu:
- production Dockerfiles
- multi-stage
- Node 24 Debian slim
- non-root
- Caddy
- React static serve
- /api reverse proxy
- Docker Compose production
- health checks
- graceful shutdown
- env validation
- database migration command
- backup runbook
- restore runbook
- no DB/Redis public ports

Target topology:
caddy
api
worker
postgres
redis

Không Kubernetes.

Tạo deployment README/runbook rõ ràng cho một VPS sạch.
```

---

# 25. PHASE 19 — Production Hardening

## Model

```text
GPT-5.6 Sol + Extra High
```

## Prompt

```text
Thực hiện Phase 19 — final production hardening.

Đây là AUDIT trước production.

Không assume code đúng.

Review toàn repository theo các nhóm:

1. Security
2. Authentication
3. RBAC
4. Database constraints
5. Migration safety
6. First-solve correctness
7. Scoring correctness
8. Reward idempotency
9. Wallet concurrency
10. BullMQ retry/dedup
11. Codeforces rate limiting
12. Scheduler recovery
13. Season boundaries
14. Reconciliation/rejudge
15. Privacy
16. Backup/restore
17. Secrets
18. Docker/network exposure
19. Logging/monitoring
20. Resource usage

Chạy toàn bộ:
- typecheck
- lint
- unit tests
- integration tests
- production build
- migration on fresh database

Phân loại findings:
BLOCKER
HIGH
MEDIUM
LOW

Fix BLOCKER/HIGH.
Không production nếu còn BLOCKER.
```

---

# 26. Bước sau khi code xong — tạo dữ liệu giả lập

Trước pilot thật, yêu cầu Codex tạo một **simulation/dev seed** riêng.

## Prompt

```text
Tạo bộ dữ liệu giả lập DEV ONLY để kiểm chứng behavior hệ thống.

Không dùng trong production.

Tạo ít nhất các nhóm học sinh:

A. Beginner:
- base 800
- tiến đều 800→1300

B. Strong student:
- base 1500
- tiến 1500→1900

C. Shock-high:
- base 800
- một số bài 1500
- sau đó tiếp tục 1400–1600

D. Shock-then-easy:
- base 800
- một số bài 1500
- sau đó nhiều bài 900

E. Easy farmer:
- rất nhiều bài thấp

F. Consistent student:
- activity nhiều ngày

G. Challenge student:
- ít bài nhưng delta cao

Mục tiêu:
- kiểm tra CC_Level
- CC_Point
- wallet
- season score
- monthly awards
- leaderboard
- streak

Tạo script reproducible và report expected outputs.
Không thay scoring formula.
```

Bạn xem dashboard/leaderboard bằng mắt và hỏi:

```text
Kết quả có hợp lý với cách mình muốn đánh giá học sinh không?
```

---

# 27. Pilot trước production thật

Khuyến nghị:

```text
1 lớp / 1 nhóm nhỏ
2–4 tuần
```

Không mở toàn trường ngay.

Theo dõi:

```text
CC_Level distribution
CC_Point per solve
Season Score
active days
streak
queue wait time
CF API failures
call-limit errors
duplicate prevention
reversal
wallet reconciliation
```

---

# 28. Prompt Codex tạo Pilot Report

Sau 1–2 tuần pilot, export dữ liệu không nhạy cảm rồi dùng:

```text
Phân tích dữ liệu pilot của Codeforces Gamification Tracker.

Không thay đổi scoring ngay.

Hãy đánh giá:

1. Distribution CC_Level
2. Distribution CC_Point/solve
3. Point theo delta difficulty
4. Top leaderboard có bị chi phối bởi volume không
5. Có dấu hiệu farm bài dễ không
6. Học sinh tiến đều có được phản ánh đúng không
7. Base-level students có lợi thế bất hợp lý không
8. Season Score có quá lớn/nhỏ không
9. Reward economy có lạm phát không
10. Queue/sync latency
11. API error/retry behavior

Tách:
- vấn đề thuật toán
- vấn đề curriculum
- vấn đề dữ liệu
- vấn đề UX
- vấn đề vận hành

Không đề xuất đổi scoring formula nếu không có bằng chứng định lượng rõ.
```

---

# 29. Khi nào được tune scoring

Không sửa:

```text
v2.0 parameters
```

trực tiếp sau khi đã có production transaction.

Nếu cần tune:

```text
v2.1
v3.0
...
```

Tạo scoring policy version mới.

## Prompt

```text
Dựa trên dữ liệu pilot đã phân tích, đề xuất scoring_policy version mới.

Yêu cầu:
- giữ toàn bộ transaction lịch sử immutable
- không recalculate point cũ
- mô phỏng policy cũ vs mới trên cùng dataset
- chỉ thay parameter nếu có lợi ích đo được
- báo impact theo beginner/intermediate/advanced
- kiểm tra anti-farm
- kiểm tra point inflation
- kiểm tra leaderboard rank changes

Chưa implement cho tới khi report simulation được duyệt.
```

---

# 30. Quy trình deploy production

Trước deploy:

```text
git clean
tests green
migration reviewed
backup verified
env verified
production compose reviewed
```

## Prompt Pre-deploy

```text
Thực hiện pre-production readiness check.

Không deploy.

Kiểm tra:
- current commit
- dirty files
- env requirements
- migrations pending
- tests
- production build
- Docker images
- Caddy config
- health checks
- backup
- restore documentation
- secret exposure
- public ports
- PostgreSQL/Redis network
- startup order
- graceful shutdown
- rollback plan

Xuất checklist PASS/FAIL.
Nếu bất kỳ mục critical FAIL, dừng và báo rõ.
```

---

# 31. Prompt Post-deploy

```text
Thực hiện post-deployment verification.

Kiểm tra:
- frontend
- API health
- worker health
- PostgreSQL
- Redis
- queue
- one safe Codeforces sync
- login
- organization authorization
- dashboard read
- leaderboard read
- no unexpected errors
- logs
- resource usage

Không tạo reward/redeem giả trên production nếu không có test account được chỉ định.

Báo:
PASS/FAIL
và rollback recommendation nếu có lỗi critical.
```

---

# 32. Công việc hàng tuần của bạn sau production

Bạn không cần đọc toàn bộ code mỗi ngày.

Mỗi tuần kiểm tra:

```text
1. Failed jobs
2. CF API call-limit errors
3. Oldest sync job age
4. Wallet reconciliation
5. Reward reversals
6. PostgreSQL disk
7. Backup result
8. Error tracking
9. Unusual leaderboard behavior
10. User/teacher feedback
```

---

# 33. Prompt Weekly Health Review

```text
Review health hệ thống tuần này dựa trên metrics/logs được cung cấp.

Đánh giá:
- availability
- API errors
- Codeforces sync
- queue lag
- retries
- duplicate prevention
- wallet reconciliation
- season aggregates
- DB performance
- disk growth
- unusual user behavior

Phân loại:
URGENT
WATCH
NORMAL

Chỉ đề xuất infrastructure upgrade khi metrics thực tế chứng minh cần.
```

---

# 34. Khi Codex báo muốn đổi kiến trúc

Nếu Codex đề xuất:

```text
microservices
Kafka
Kubernetes
GraphQL
Elasticsearch
MongoDB
```

hãy dùng prompt:

```text
Chưa được phép thay kiến trúc.

Hãy chứng minh bằng metrics hoặc requirement cụ thể:
1. bottleneck hiện tại là gì?
2. số liệu nào chứng minh?
3. stack hiện tại không giải quyết được bằng cách đơn giản hơn ở đâu?
4. chi phí vận hành mới là gì?
5. migration risk?
6. rollback plan?
7. giải pháp đơn giản nhất trước khi thêm infrastructure là gì?

Không implement thay đổi kiến trúc.
```

---

# 35. Khi Codex phát hiện PRD có vấn đề

Dùng:

```text
Dừng implementation phần bị ảnh hưởng.

Hãy báo:
1. section PRD liên quan
2. rule hiện tại
3. tình huống gây mâu thuẫn
4. ví dụ dữ liệu cụ thể
5. hậu quả nếu giữ rule
6. 2–3 phương án sửa
7. phương án bạn khuyến nghị
8. migration/backward-compatibility impact

Không tự sửa business rule cho đến khi được duyệt.
```

---

# 36. Khi một phase bị lỗi nhiều

Không tiếp tục nhồi thêm patch.

Prompt:

```text
Dừng feature work.

Hãy thực hiện root-cause analysis cho phase hiện tại.

1. Liệt kê symptoms.
2. Xác định invariant bị phá.
3. Tạo minimal reproduction.
4. Xác định root cause.
5. Phân biệt:
   - design issue
   - implementation issue
   - test issue
   - dependency issue
6. Đề xuất minimal fix.
7. Viết regression test trước khi fix.
8. Sau fix chạy toàn bộ relevant tests.

Không refactor ngoài phạm vi trừ khi cần để sửa root cause.
```

---

# 37. Khi chuẩn bị merge một phần critical

Cho:

```text
scoring
wallet
ledger
queue
season
auth
migration
```

dùng review prompt riêng:

```text
Review diff hiện tại như một principal engineer.

Không tập trung style.

Tập trung:
- correctness
- race conditions
- transactional integrity
- idempotency
- security
- data loss
- backward compatibility
- failure recovery
- observability
- test gaps

Trace cả happy path và failure path.

Nếu không tìm thấy vấn đề, giải thích cụ thể invariant nào đã được bảo vệ bởi:
- DB constraint
- transaction
- test
- code path

Không kết luận "looks good" chung chung.
```

---

# 38. Git workflow khuyến nghị

Mỗi phase hoặc feature lớn:

```text
main
  └── feat/phase-X-...
```

Commit nhỏ, có nghĩa.

Ví dụ:

```text
chore: bootstrap project architecture
feat: add core database schema
feat: implement organization RBAC
feat: add codeforces sync queue
feat: implement canonical first solves
feat: add cc level scoring
feat: add immutable point ledger
feat: add season snapshots
```

Không để Codex tạo một commit khổng lồ cho 10 phase.

---

# 39. Rule quyết định chuyển phase

Chỉ chuyển khi cả 5 câu đều là YES:

```text
1. Definition of Done đạt chưa?
2. Relevant tests xanh chưa?
3. Có critical assumption chưa quyết không?
4. Có correctness TODO không?
5. Repository hiện deploy/build được không?
```

Nếu câu 3 hoặc 4 là YES theo nghĩa "còn vấn đề":

```text
KHÔNG chuyển phase.
```

---

# 40. Roadmap tổng thể cho bạn

```text
Bước 1
Tạo repo + copy 3 tài liệu

Bước 2
Codex đọc tài liệu, chưa code

Bước 3
Phase 0: Bootstrap

Bước 4
Phase 1: Database

Bước 5
Phase 2–3: Auth/Org/CF verification

Bước 6
Phase 4–8: Sync/Submissions/First Solve/Level/Backfill

Bước 7
Phase 9–12: Point/Ledger/Wallet/Season/Awards/Rewards

Bước 8
Phase 13–17: Scheduler/UI/Streak/Admin/Reconciliation

Bước 9
Phase 18–19: Deployment + Hardening

Bước 10
Synthetic simulation

Bước 11
Pilot 2–4 tuần

Bước 12
Phân tích pilot

Bước 13
Tune policy nếu thực sự cần

Bước 14
Production rollout rộng hơn

Bước 15
Weekly health review
```

---

# 41. Công việc chính của bạn với vai trò chủ dự án

Bạn chủ yếu quyết định:

## Nghiệp vụ

- học sinh nào được verify;
- organization nào public/private;
- season calendar;
- giải thưởng hàng tháng;
- reward catalog;
- CC_Base đặc biệt;
- policy correction.

## Nghiệm thu

- scoring có hợp lý về giáo dục không;
- leaderboard có tạo động lực đúng không;
- anti-farm có hiệu quả không;
- UI giáo viên/học sinh có dễ dùng không.

## Vận hành

- backup;
- pilot;
- production release;
- review metrics;
- quyết định khi nào tune policy.

Không cần tự quyết các chi tiết implementation nhỏ nếu tests/invariant đã rõ.

---

# 42. Prompt bạn có thể dùng NGAY BÂY GIỜ

Sau khi đặt ba file vào repo:

```text
Hãy đọc toàn bộ:

- codeforces-gamification-prd-v2.md
- CODEX_IMPLEMENTATION_BRIEF.md
- OWNER_CODEX_PLAYBOOK.md

Bạn đang phụ trách triển khai dự án này.

Hiện tại CHƯA CODE.

Trước tiên:
1. Khảo sát toàn bộ repository.
2. Xác định trạng thái hiện tại.
3. Xác nhận các invariant correctness quan trọng.
4. So sánh repository với yêu cầu Phase 0.
5. Lập kế hoạch thực hiện Phase 0 theo thứ tự.
6. Liệt kê assumptions/risks.
7. Chỉ ra bất kỳ điểm nào trong tài liệu mà code hiện tại đang mâu thuẫn.

Không triển khai Phase 1 hoặc business feature.

Sau khi báo cáo xong, dừng để tôi duyệt kế hoạch.
```

Sau khi bạn duyệt plan, gửi:

```text
Kế hoạch Phase 0 được duyệt.

Hãy triển khai CHỈ Phase 0 theo kế hoạch.

Tuân thủ đầy đủ:
- PRD
- CODEX_IMPLEMENTATION_BRIEF
- OWNER_CODEX_PLAYBOOK

Hoàn thành Definition of Done.
Chạy typecheck, lint, tests và builds.
Tự review diff.
Báo files changed, commands/tests, assumptions và remaining risks.

Không làm sang Phase 1.
```

---

# 43. Quy tắc cuối cùng

Với dự án này:

```text
Không tối ưu bằng cách thêm nhiều công nghệ.
Tối ưu bằng cách giảm trạng thái,
giữ invariant ở database,
chia task nhỏ,
test failure path,
và đo trước khi scale.
```

Codex là người triển khai.

PRD là nguồn quyết định nghiệp vụ.

Database constraints + transaction là hàng rào correctness.

Bạn là người duyệt business behavior và quyết định khi nào chuyển phase.

**End of Owner Playbook**
