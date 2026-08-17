# PRD v2.1 — Codeforces Gamification Tracker

> **Trạng thái:** Production-ready design — Final optimized stack review  
> **Ngày rà soát:** 18/08/2026  
> **Thay thế:** `cc.mrtee.md` (PRD v1)  
> **Mục tiêu:** Theo dõi tiến độ Codeforces của học sinh, ước lượng năng lực, tạo động lực bằng điểm thưởng và leaderboard, nhưng phải chống farm bài dễ, chống sốc điểm, chống cộng điểm trùng, có thể audit và vận hành ổn định với giới hạn API Codeforces.

---

## 0. Các quyết định cốt lõi

Bản v2 chốt các nguyên tắc sau:

1. **`CC_Level` và `CC_Point` là hai khái niệm độc lập.**
   - `CC_Level`: chỉ số năng lực dài hạn.
   - `CC_Point`: đơn vị thưởng có thể dùng để đổi quà.

2. **`CC_Level` giữ ý tưởng weighted-top-solves của bản v1**, nhưng công thức được viết lại đúng bản chất toán học.

3. **`CC_Point` dùng hàm sigmoid liên tục và có trần**, thay cho ba vùng nhân `100% / 20% / 5%`.
   - Không có cliff tại ranh giới.
   - Không thể nhận hàng trăm điểm chỉ từ một bài quá khó.
   - Bài thấp hơn trình độ nhiều vẫn chỉ nhận micro-point.

4. **Mặc định `CC_Base = 800`**, không phải `0`.
   - Tránh tài khoản mới coi mọi bài rating 800 là bài “vượt trình” cực lớn.
   - Giáo viên có thể gán `CC_Base` cao hơn cho học sinh đã có nền tảng.

5. **Reward dùng `CC_Level` ngay trước lần solve đó**, tuyệt đối không tính lại reward lịch sử bằng level hiện tại.

6. **Backfill lịch sử chỉ dùng để dựng năng lực, không phát point retroactive.**
   - Bài đã solve trước khi tham gia hệ thống được đánh dấu đã giải.
   - Re-solve bài cũ sau khi tham gia cũng không được thưởng.

7. **Mỗi `(user, problem)` chỉ có một first solve hợp lệ.**
   - Mỗi submission được xử lý idempotent.
   - Retry worker không thể cộng point lần hai.

8. **Wallet và leaderboard tách rời.**
   - Đổi quà làm giảm wallet.
   - Không làm giảm thành tích season đã kiếm được.

9. **PostgreSQL là source of truth.**
   - Redis chỉ làm queue, deduplication, cache và coordination.
   - Redis mất dữ liệu không được làm mất point/wallet/solve.

10. **Mọi thay đổi điểm đều đi qua immutable ledger.**
    - Không sửa transaction cũ.
    - Sai dữ liệu thì tạo transaction `REVERSAL` / `ADJUSTMENT`.

11. **Codeforces sync dùng một global rate limiter cho toàn hệ thống.**
    - Mặc định an toàn: **1 API request / 2.2 giây**.
    - Không tăng số worker để vượt giới hạn upstream.

12. **Khởi đầu bằng modular monolith**, không dùng microservices/Kubernetes nếu chưa có nhu cầu thực tế.

---

# 1. Mục tiêu hệ thống

## 1.1. Mục tiêu sản phẩm

Hệ thống cần:

- Theo dõi các bài Codeforces học sinh đã giải.
- Phản ánh năng lực dài hạn bằng `CC_Level`.
- Tạo động lực luyện tập bằng `CC_Point`.
- Khuyến khích giải bài vừa sức hoặc khó hơn.
- Hạn chế farm hàng loạt bài quá dễ.
- Không để một bài bất thường phá leaderboard.
- Có leaderboard theo tổ chức và season.
- Có streak và thống kê tag.
- Cho phép đổi quà bằng point.
- Có audit đầy đủ khi cộng/trừ/sửa point.
- Chịu được worker retry, double click, concurrent redeem và API lỗi.
- Tôn trọng giới hạn API Codeforces.
- Có thể mở rộng từ một lớp học tới nhiều trường mà không cần đổi kiến trúc cốt lõi.

## 1.2. Non-goals

Phiên bản đầu **không** cần:

- Microservices.
- Kubernetes.
- Real-time sync từng submission.
- Scraping HTML Codeforces.
- Phân tích source code chống đạo văn.
- Machine Learning để dự đoán năng lực.
- Sao chép toàn bộ dữ liệu Codeforces về hệ thống.
- Phát point cho lịch sử trước ngày tham gia.

---

# 2. Stack công nghệ

## 2.1. Frontend

Chốt cho production:

- **React 19.2 + TypeScript**.
- **Vite 8.x**.
- **Tailwind CSS 4.x**.
- **TanStack Query** cho server-state/cache phía client.
- React Router cho routing phía client.
- Dark Mode bắt buộc.
- Responsive desktop/mobile.

Không dùng Next.js/SSR trong MVP vì:

- dashboard và phần lớn nội dung yêu cầu đăng nhập;
- public leaderboard không cần SEO phức tạp;
- SPA build ra static asset nhẹ hơn khi vận hành;
- tránh phải giữ thêm một Node process chỉ để render frontend.

Production flow:

```text
Vite build
   ↓
static HTML/CSS/JS
   ↓
Caddy serve trực tiếp
```

Public leaderboard có thể cache ngắn tại API/Caddy. Không cache dữ liệu authorization-sensitive ở reverse proxy nếu cache key không tách đầy đủ quyền người dùng.

## 2.2. Backend

Chốt cho production:

- **Node.js 24 LTS**.
- **NestJS + TypeScript**.
- REST API.
- **Drizzle ORM + SQL migrations rõ ràng**.
- PostgreSQL transaction cho mọi luồng correctness-critical.
- Validation schema rõ ràng.
- OpenAPI/Swagger.
- Một repository / modular monolith.

Process runtime mặc định chỉ cần:

```text
api
worker
```

Scheduler logic chạy trong worker bằng distributed coordination/lock. Chỉ tách `scheduler` thành process/container riêng nếu sau này cần isolation vận hành.

### Vì sao Drizzle

Dự án có nhiều:

- unique/partial indexes;
- transaction;
- row locking;
- aggregate query;
- constraint;
- migration cần review SQL.

Do đó ưu tiên ORM mỏng, type-safe và gần SQL thay vì một abstraction nặng.

Không cấm raw SQL. Những query cần `FOR UPDATE`, CTE, partial index hoặc tối ưu query plan nên viết SQL rõ ràng khi hợp lý.

### Vì sao modular monolith

- Domain chưa đủ lớn để justify microservices.
- Wallet/reward/season cần transaction nhất quán.
- Codeforces API là bottleneck upstream chính.
- Dễ deploy, backup, debug và integration-test.
- Có thể tách service sau này nếu metrics thực tế chứng minh nhu cầu.

Không dùng microservices/Kafka/RabbitMQ chỉ để “future-proof”.

## 2.3. Database, queue và cache

### PostgreSQL

Chốt **PostgreSQL 18.x**, production hiện ưu tiên latest stable patch trong nhánh 18 (18.6 tại thời điểm rà soát).

PostgreSQL là **source of truth duy nhất** cho:

- user/account/membership;
- submission/first solve;
- skill state;
- scoring policy;
- point ledger;
- wallet;
- season;
- reward order;
- audit.

Tận dụng:

- transaction + row locking;
- unique/partial indexes;
- `NUMERIC` cho point/wallet;
- `TIMESTAMPTZ`;
- JSONB chỉ cho metadata linh hoạt, không thay thế relational schema.

### Redis + BullMQ

Redis chỉ dùng cho dữ liệu có thể tái tạo:

- BullMQ;
- job deduplication;
- global rate limiter;
- distributed coordination/short lock;
- short-lived cache.

Không dùng Redis làm source of truth cho wallet, solve hoặc transaction.

BullMQ dùng cho:

- `cf-sync`;
- retry/backoff;
- delayed jobs;
- on-demand/scheduled sync.

BullMQ hiện hỗ trợ **global queue rate limit**, nên không cần tự xây token-bucket riêng cho Codeforces trừ khi upstream behavior sau này yêu cầu phức tạp hơn.

### Redis persistence

MVP có thể vận hành Redis với persistence tối giản hoặc không phụ thuộc persistence cho correctness, với điều kiện:

- scheduler state/checkpoint nằm ở PostgreSQL;
- queue mất có thể enqueue lại;
- không có business event chỉ tồn tại ở Redis.

Nếu production cần giảm mất các delayed job khi restart, bật AOF phù hợp; đây là durability optimization chứ không thay đổi source of truth.

## 2.4. Reverse proxy, static hosting và container

Chốt:

- **Caddy** làm TLS termination + reverse proxy + serve frontend static.
- Docker multi-stage build.
- Node image dạng Debian slim (`node:24-*-slim`), chạy non-root.
- Healthcheck.
- Graceful shutdown API/worker.
- Pin major/minor phù hợp; production có thể pin image digest.

Không cần container frontend chạy Node sau build.

Topology tối giản trên một VPS:

```text
Caddy
├── serve / static React build
└── reverse_proxy /api/* → api

api
worker
postgres
redis
```

Tổng cộng **5 container** nếu Caddy cũng serve frontend.

Scheduler mặc định nằm trong worker process. Chỉ tách riêng khi có nhu cầu operational isolation.

### Vì sao Caddy

- automatic HTTPS;
- config ngắn;
- serve static + reverse proxy trong cùng process;
- giảm một frontend runtime container;
- phù hợp hệ thống nhỏ/trung bình.

Nếu đội vận hành đã chuẩn hóa Nginx thì Nginx vẫn được hỗ trợ; đây không phải business dependency.

Dùng `compose.yaml` + `compose.production.yaml`. Chưa dùng Kubernetes.

---

# 3. Mô hình domain

## 3.1. User

User là tài khoản trong hệ thống, không đồng nhất trực tiếp với Codeforces handle.

Một User có tối đa một Codeforces account đang liên kết trong MVP.

Trạng thái:

```text
ACTIVE
INACTIVE
SUSPENDED
```

- `ACTIVE`: được sync.
- `INACTIVE`: giữ dữ liệu nhưng không scheduled sync.
- `SUSPENDED`: khóa hành vi cần quyền nhưng không xóa lịch sử.

## 3.2. Codeforces Account

Tách khỏi bảng User để:

- handle có thể thay đổi;
- quản lý verification;
- quản lý trạng thái sync;
- không trộn dữ liệu external-provider vào user identity.

Verification mặc định cho môi trường trường học:

```text
ADMIN_VERIFIED
TEACHER_VERIFIED
UNVERIFIED
```

`UNVERIFIED` có thể xem preview nhưng **không được tham gia reward/leaderboard**.

Không coi việc nhập đúng handle là bằng chứng sở hữu.

## 3.3. Organization

Organization có thể tạo cây:

```text
Trường
├── Khối/Lớp
├── CLB
└── Đội tuyển
```

Một organization có:

```text
PUBLIC
CLOSED
PRIVATE
```

- `PUBLIC`: guest có thể xem leaderboard được phép công khai.
- `CLOSED`: cần đăng nhập.
- `PRIVATE`: chỉ thành viên và người quản lý được xem.

Nên có `parent_org_id` để hỗ trợ hierarchy.

## 3.4. Membership Role

```text
MEMBER
TEACHER
ORG_ADMIN
```

System-level role tách riêng:

```text
SYSTEM_ADMIN
```

---

# 4. Thuật toán `CC_Level`

## 4.1. Ý nghĩa

`CC_Level` phản ánh **năng lực dài hạn**.

Yêu cầu:

- tăng chậm;
- khó bị thao túng bằng một vài bài rất khó;
- không bị farm bởi số lượng lớn bài rất dễ;
- không giảm chỉ vì người học giải thêm bài hợp lệ;
- có thể bootstrapping bằng mức nền do giáo viên gán.

## 4.2. Tập bài dùng để tính

Chỉ lấy các problem thỏa:

- submission có verdict `OK`;
- problem `type = PROGRAMMING`;
- problem có `rating`;
- submission là cá nhân;
- problem chưa từng được tính trước đó cho user.

Bài không rating:

- vẫn có thể tính activity/streak;
- **không** tăng `CC_Level`;
- **không** sinh `CC_Point` mặc định.

Team submission mặc định:

- lưu để audit nếu gặp;
- không tính level;
- không tính reward;
- không tính first-solve cá nhân.

## 4.3. Problem identity

Canonical key:

```text
contest:{contestId}:{index}
```

Nếu không có `contestId` nhưng có `problemsetName`:

```text
problemset:{problemsetName}:{index}
```

Không dùng `name` làm unique key.

## 4.4. Công thức

Lấy rating của các problem unique đã solve:

\[
D_1 \ge D_2 \ge ... \ge D_n
\]

và:

\[
CC_{Calculated}
=
\frac{1}{20}
\sum_{i=1}^{n}
D_i \cdot 0.95^{i-1}
\]

Sau đó:

\[
CC_{Level}
=
\max(CC_{Base}, CC_{Calculated})
\]

Mặc định:

```text
CC_Base = 800
```

Teacher/Admin có thể đặt cao hơn.

## 4.5. Vì sao mẫu số là 20

Vì:

\[
\sum_{i=1}^{\infty}0.95^{i-1}
=
\frac{1}{1-0.95}
=
20
\]

Do đó biểu thức `max(20, sum(weights))` của bản cũ thực tế luôn bằng `20` với mọi tập hữu hạn.

Viết thẳng `/20` giúp:

- dễ hiểu;
- dễ test;
- không thay đổi hành vi mong muốn.

## 4.6. Hành vi hội tụ

Nếu người học solve toàn bài cùng rating `D`:

\[
CC_{Calculated}
=
D(1-0.95^n)
\]

Xấp xỉ:

| Số bài | % hội tụ tới D |
|---:|---:|
| 10 | 40.13% |
| 20 | 64.15% |
| 40 | 87.15% |
| 60 | 95.39% |
| 90 | 99.01% |

Ý nghĩa:

- một bài rất khó không đủ để nâng level lớn;
- khoảng 40 bài khó tương đương mới thể hiện phần lớn năng lực ở mức đó;
- các bài sau vẫn đóng góp nhưng giảm dần.

## 4.7. Tính đơn điệu

Với một `CC_Base` cố định và chỉ thêm first-solve hợp lệ:

```text
CC_Level mới >= CC_Level cũ
```

Level chỉ có thể giảm trong trường hợp **data correction**:

- Codeforces rejudge làm invalid một solve;
- Admin sửa nhầm `CC_Base`;
- sửa mapping problem;
- migration/reconciliation có lý do rõ ràng.

Mọi correction phải có audit log.

## 4.8. Display

- Backend giữ raw value với độ chính xác cao.
- UI có thể hiển thị làm tròn tới 10 điểm gần nhất.
- Reward luôn dùng raw value, không dùng số đã làm tròn trên UI.

---

# 5. Thuật toán `CC_Point` v2

## 5.1. Mục tiêu

Reward phải:

- tăng theo độ khó tương đối so với trình độ;
- liên tục, không có cliff;
- có trần;
- bài quá dễ chỉ nhận micro-point;
- bài ngang trình độ nhận khoảng 10 point;
- bài cao hơn 100–300 rating được thưởng rõ rệt;
- một bài cực cao không thể phá leaderboard.

## 5.2. Level dùng để tính reward

Với một first solve tại thời điểm `t`:

```text
L = CC_Level ngay trước khi problem đó được thêm vào skill state
D = rating snapshot của problem tại thời điểm award
delta = D - L
```

**Không** dùng level sau batch sync.

Nếu một sync lấy về nhiều solve mới, phải xử lý chúng theo:

```text
creation_time ASC
cf_submission_id ASC
```

để reward deterministic.

## 5.3. Công thức

Đề xuất mặc định:

\[
CC_{PointRaw}
=
0.05
+
\frac{29.95}
{1 + e^{-\frac{(D-L)-50}{80}}}
\]

Sau đó:

\[
CC_{Point}
=
\min(30.00,\ \max(0.05,\ round(CC_{PointRaw}, 2)))
\]

Thuộc tính sau khi lưu:

```text
0.05 <= CC_Point <= 30.00
```

Sigmoid đã tự tiến dần tới trần 30; phép clamp chỉ bảo vệ sai số làm tròn/số học.

## 5.4. Bảng minh họa

| `D - L` | Point xấp xỉ |
|---:|---:|
| -500 | 0.08 |
| -400 | 0.16 |
| -300 | 0.42 |
| -200 | 1.31 |
| -100 | 4.03 |
| 0 | 10.49 |
| +100 | 19.56 |
| +200 | 26.02 |
| +300 | 28.74 |
| +500 | 29.89 |

## 5.5. Vì sao tốt hơn ba vùng thưởng

Không còn trường hợp:

```text
chênh một ranh giới nhỏ
→ reward rơi ngay 4–5 lần
```

Hàm mới:

- monotonic theo `D-L`;
- smooth;
- bounded;
- dễ mô phỏng;
- không cần ghép nhiều multiplier.

## 5.6. Chính sách bài cũ

Khi account được verify:

1. Ghi ngay `reward_eligible_from = verified_at`.
2. Chạy backfill first-solve lịch sử.
3. Các solve trước mốc này chỉ dùng để dựng baseline `CC_Level`.
4. Các first-solve xảy ra từ mốc này trở đi được xếp theo thời gian tăng dần và có thể sinh EARN sau khi backfill hoàn tất.
5. **Không tạo EARN transaction cho solve trước mốc eligibility.**

Nếu một problem đã từng solve trước `reward_eligible_from`:

```text
solve lại sau này != rewardable
```

Điều này chặn việc farm lại kho bài cũ.

## 5.7. Versioning thuật toán

Không hard-code rồi thay công thức âm thầm.

Tạo `scoring_policies`:

```text
version
level_decay
level_denominator
default_cc_base
reward_min
reward_max
reward_midpoint_delta
reward_scale
effective_from
created_at
created_by
```

Ví dụ:

```text
version = "v2.0"
level_decay = 0.95
level_denominator = 20
default_cc_base = 800
reward_min = 0.05
reward_max = 30.00
reward_midpoint_delta = 50
reward_scale = 80
```

Mỗi transaction EARN lưu `scoring_policy_version`.

Không retroactively thay point cũ khi đổi policy.

---

# 6. First Solve và idempotency

## 6.1. Canonical first solve

Tạo bảng riêng:

```text
user_problem_solves
```

Unique:

```text
(user_id, problem_key)
```

Bảng này là đáp án duy nhất cho câu hỏi:

> User đã từng solve problem này chưa?

## 6.2. Reward uniqueness

Một EARN bắt buộc gắn với:

```text
source_submission_id
```

Tạo unique partial index/constraint cho EARN.

Dù:

- worker retry;
- API trả trùng;
- user double click;
- hai worker cùng xử lý;

thì chỉ được có **một EARN** cho submission/first-solve.

## 6.3. Không dựa vào BullMQ để đảm bảo tiền

BullMQ dedup giúp giảm job thừa, nhưng financial-like correctness phải nằm ở PostgreSQL.

Nguyên tắc:

```text
Queue dedup = efficiency
Database uniqueness + transaction = correctness
```

---

# 7. Wallet, Season và Leaderboard

## 7.1. Ba con số khác nhau

Không gộp chung:

```text
CC_Level
Wallet Balance
Season Score
```

### `CC_Level`

Năng lực.

### `Wallet Balance`

Số point hiện còn dùng được để đổi quà.

### `Season Score`

Điểm thành tích trong một season.

## 7.2. Immutable ledger

Bảng:

```text
point_transactions
```

Transaction type:

```text
EARN
BONUS
REDEEM
REFUND
PENALTY
REVERSAL
ADJUSTMENT
```

Không UPDATE amount của transaction cũ.

Nếu sai:

```text
old EARN +10
new REVERSAL -10
```

## 7.3. Wallet

Wallet balance được cập nhật **trong cùng PostgreSQL transaction** với ledger entry.

Có thể lưu:

```text
user_wallets.balance
```

để đọc nhanh.

Ledger vẫn cho phép rebuild lại balance.

Dùng:

```text
NUMERIC(12,2)
```

không dùng floating point cho wallet/transaction amount.

## 7.4. Season

Bảng `seasons`:

```text
id
org_id nullable
name
start_at
end_at
status
scoring_policy_version
created_at
```

Status:

```text
DRAFT
ACTIVE
CLOSING
CLOSED
```

## 7.5. Season score

Mặc định:

```text
Season Score
= EARN
+ BONUS
+ PENALTY
+ REVERSAL
+ leaderboard-affecting ADJUSTMENT
```

Không gồm:

```text
REDEEM
REFUND
```

Vì mua quà không được làm mất thành tích đã đạt.

## 7.6. Aggregate table

Để leaderboard nhanh:

```text
season_user_totals
```

Fields:

```text
season_id
user_id
earned
bonus
penalty
score
qualifying_solves
updated_at
```

Unique:

```text
(season_id, user_id)
```

Đây là read model/cache có thể rebuild từ ledger.

Ledger mới là source of truth.

---

# 8. Reward Store

## 8.1. Rewards

```text
rewards
-------
id
name
description
cost
stock nullable
active
image_url nullable
created_at
updated_at
```

`cost` dùng `NUMERIC(12,2)`.

## 8.2. Reward Orders

```text
reward_orders
-------------
id
user_id
reward_id
cost_snapshot
status
created_at
reviewed_at
reviewed_by
note
```

Status:

```text
REQUESTED
APPROVED
FULFILLED
REJECTED
CANCELLED
```

## 8.3. Redeem atomic

Redeem phải chạy trong một PostgreSQL transaction:

1. Lock wallet row (`SELECT ... FOR UPDATE`) hoặc atomic conditional update.
2. Kiểm tra balance.
3. Nếu reward có stock, lock/check stock.
4. Tạo order.
5. Tạo `REDEEM` ledger entry.
6. Trừ wallet.
7. Commit.

Hai request song song không được tiêu cùng một balance.

## 8.4. Reject/Cancel

Nếu một order đã trừ point nhưng bị reject/cancel:

- không sửa `REDEEM`;
- tạo `REFUND` transaction.

---

# 9. Codeforces API Sync

## 9.1. Upstream constraint

Codeforces API hiện quy định tối đa:

```text
1 request / 2 seconds
```

Do đó production config mặc định:

```text
GLOBAL_CF_API_INTERVAL_MS = 2200
```

Tức khoảng:

```text
~27 request/phút
~1636 request/giờ
```

Khoảng đệm 200 ms dùng để giảm rủi ro do scheduling/network jitter.

## 9.2. Một queue chung

Dùng một queue logic:

```text
cf-sync
```

Mọi on-demand/scheduled/retry đều đi qua cùng global limiter.

Không tạo nhiều queue độc lập nếu mỗi queue có limiter riêng vì có thể vô tình cộng dồn throughput vượt upstream limit.

## 9.3. BullMQ global limiter

Dùng queue-level global rate limit tương đương:

```text
max = 1
duration = 2200 ms
```

Có thể có nhiều worker để tăng fault tolerance, nhưng aggregate API throughput vẫn phải giữ đúng limiter.

## 9.4. Job deduplication

Dedup key:

```text
sync:{user_id}
```

Trong lúc một job user đang:

```text
waiting
delayed
active
retrying
```

không tạo job đồng nghĩa khác.

UI trả:

```text
Đang chờ cập nhật
```

thay vì enqueue hàng loạt.

## 9.5. On-demand sync

Endpoint:

```text
POST /me/sync
```

Luồng:

1. Authenticate.
2. Kiểm tra account verified.
3. Nếu có job đang pending → trả trạng thái job.
4. Nếu `last_sync_at` quá mới → trả dữ liệu hiện tại + thời gian có thể refresh tiếp.
5. Nếu hợp lệ → enqueue.
6. Frontend poll status hoặc nhận SSE/WebSocket notification.

User-level refresh cooldown mặc định:

```text
120 giây
```

Cooldown này là UX/anti-spam, không thay thế global limiter.

## 9.6. Scheduled sync

Không dùng cron “quét tất cả user mỗi 3 giờ”.

Lưu:

```text
next_sync_at
```

Scheduler định kỳ chọn:

```sql
status = ACTIVE
AND next_sync_at <= now()
```

rồi enqueue theo ngân sách.

### Suggested activity tiers

```text
HOT  : user hoạt động gần đây → sync thường xuyên hơn
WARM : sync trung bình
COLD : sync thưa
```

Ví dụ ban đầu:

```text
HOT  : 1–2 giờ
WARM : 6 giờ
COLD : 24 giờ
```

Nhưng cadence phải **capacity-aware**, không phải hằng số tuyệt đối.

## 9.7. Capacity planning

Với 2.2 giây/request:

| User | Thời gian tối thiểu để mỗi user nhận 1 request |
|---:|---:|
| 500 | ~18 phút |
| 2,000 | ~73 phút |
| 10,000 | ~6.1 giờ |

Nên reserve khoảng 20–30% capacity cho:

- on-demand;
- retry;
- backfill;
- maintenance/reconciliation.

Nếu queue lag tăng, scheduler tự giãn cadence của WARM/COLD.

## 9.8. Incremental sync

Codeforces `user.status` trả submission theo `id` giảm dần.

Lưu:

```text
last_seen_submission_id
```

Mỗi sync:

1. Fetch trang đầu.
2. Upsert các submission gần đây để reconciliation.
3. Nếu đã gặp checkpoint cũ → dừng.
4. Nếu chưa gặp → fetch trang tiếp.
5. Khi đã đủ dữ liệu mới → xử lý first-solve theo thời gian tăng dần.
6. Cập nhật checkpoint sau khi transaction thành công.

Không fetch toàn bộ lịch sử sau mỗi lần sync.

## 9.9. Initial backfill

Lần đầu account verified:

1. Set ngay `reward_eligible_from = verified_at`.
2. Enqueue `BACKFILL`.
3. Paginate `user.status`.
4. Canonicalize first solves.
5. Dùng các solve có `first_solved_at < reward_eligible_from` để dựng baseline `CC_Level`.
6. Sau baseline, xử lý các first-solve có `first_solved_at >= reward_eligible_from` theo thời gian tăng dần để award đúng `L_before`.
7. Set:
   - `backfill_completed_at`
   - `last_seen_submission_id`

Trong lúc backfill chưa xong:

```text
reward_state = INITIALIZING
```

Live sync có thể được dedup/delay; không phát thưởng song song với backfill để tránh race. User vẫn không mất reward cho solve mới vì eligibility đã được chốt tại thời điểm verify.

## 9.10. Retry

Các lỗi tạm thời:

- network timeout;
- HTTP/upstream failure;
- Codeforces call limit;
- Redis transient error;

dùng retry có exponential backoff + jitter.

Các lỗi không recoverable:

- handle không tồn tại;
- account bị unlink;
- malformed domain data kéo dài;

không retry vô hạn.

## 9.11. API circuit behavior

Nếu nhận:

```text
FAILED / Call limit exceeded
```

worker phải:

- không đánh job completed;
- rate-limit queue tạm thời;
- retry sau;
- tăng metric cảnh báo.

Không spin retry ngay lập tức.

---

# 10. Reconciliation và rejudge

## 10.1. Vì sao cần reconciliation

Submission verdict có thể cần được nhìn lại sau lần ingest đầu.

Do đó mỗi incremental sync nên re-upsert một cửa sổ submission gần nhất thay vì chỉ đọc đúng các ID chưa từng thấy.

Mặc định:

```text
RECENT_RECONCILE_COUNT = 100
```

Có thể chỉnh theo thực tế.

## 10.2. Reward reversal

Nếu một submission từng sinh EARN nhưng sau reconciliation không còn hợp lệ:

1. Không xóa EARN.
2. Tạo `REVERSAL`.
3. Re-evaluate first valid solve của problem.
4. Recompute skill state nếu cần.
5. Ghi audit reason.

`CC_Level` có thể giảm trong case này vì đây là data correction, không phải hành vi luyện tập bình thường.

---

# 11. Streak

## 11.1. Qualifying day

Một ngày được tính streak nếu có ít nhất một:

- individual submission;
- verdict `OK`;
- problem `PROGRAMMING`;
- first solve của user.

Bài unrated có thể tính streak.

Re-submit bài đã solve không kéo streak.

## 11.2. Timezone

Không dùng UTC date trực tiếp.

Có:

```text
users.timezone
```

fallback:

```text
organization.timezone
```

fallback cuối:

```text
Asia/Ho_Chi_Minh
```

Store timestamps bằng `timestamptz`.

Convert sang local date khi tính streak.

## 11.3. State

Có thể cache:

```text
current_streak
longest_streak
last_qualifying_date
```

Nhưng các giá trị này phải rebuild được từ first-solves.

---

# 12. Tag Analytics

Radar chart không nên chỉ đếm submission.

Đề xuất cho MVP:

Với mỗi tag, lấy các unique rated first-solves chứa tag và tính:

```text
Tag Score = weighted score từ rating và recency/count
```

Đơn giản nhất:

\[
TagScore
=
\frac{1}{10}
\sum_{i=1}^{n}
D_i \cdot 0.9^{i-1}
\]

trong đó `D_i` là các rating cao nhất của problem mang tag.

Radar hiển thị top 6–8 tag theo Tag Score.

Đây chỉ là analytics, **không ảnh hưởng reward**.

Nếu muốn giảm complexity ở MVP, có thể chỉ hiển thị:

```text
unique solved count by tag
average rating
max rating
```

---

# 13. Database Schema v2

## 13.1. `users`

```text
id UUID PK
full_name VARCHAR
display_name VARCHAR
status ENUM
timezone VARCHAR
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Không lưu wallet trực tiếp trong bảng này.

## 13.2. `codeforces_accounts`

```text
id UUID PK
user_id UUID UNIQUE FK
handle CITEXT UNIQUE
verification_status ENUM
verified_at TIMESTAMPTZ NULL
verified_by UUID NULL
reward_eligible_from TIMESTAMPTZ NULL

last_seen_submission_id BIGINT NULL
last_sync_at TIMESTAMPTZ NULL
next_sync_at TIMESTAMPTZ NULL
backfill_completed_at TIMESTAMPTZ NULL

sync_status ENUM
last_sync_error TEXT NULL

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 13.3. `user_skill_state`

```text
user_id UUID PK FK
cc_base NUMERIC(10,2)
cc_calculated NUMERIC(10,2)
cc_level NUMERIC(10,2)
scoring_policy_version VARCHAR
updated_at TIMESTAMPTZ
```

Default:

```text
cc_base = 800
```

## 13.4. `organizations`

```text
id UUID PK
parent_org_id UUID NULL FK
name VARCHAR
slug VARCHAR UNIQUE
visibility ENUM
timezone VARCHAR
status ENUM
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 13.5. `organization_memberships`

```text
organization_id UUID FK
user_id UUID FK
role ENUM
status ENUM
joined_at TIMESTAMPTZ
left_at TIMESTAMPTZ NULL

PK (organization_id, user_id)
```

## 13.6. `cf_problems`

```text
problem_key VARCHAR PK
contest_id BIGINT NULL
problemset_name VARCHAR NULL
problem_index VARCHAR
name VARCHAR
type VARCHAR
current_rating INT NULL
tags TEXT[]
updated_at TIMESTAMPTZ
```

Unique constraint phù hợp theo loại key.

## 13.7. `cf_submissions`

```text
cf_submission_id BIGINT PK
user_id UUID FK
problem_key VARCHAR FK

creation_time TIMESTAMPTZ
verdict VARCHAR
participant_type VARCHAR NULL
is_team BOOLEAN
programming_language VARCHAR NULL

problem_rating_observed INT NULL
raw_metadata JSONB NULL

first_seen_at TIMESTAMPTZ
last_seen_at TIMESTAMPTZ
```

Không cần lưu source code.

## 13.8. `user_problem_solves`

```text
user_id UUID FK
problem_key VARCHAR FK

first_ok_submission_id BIGINT FK
first_solved_at TIMESTAMPTZ
rating_snapshot INT NULL
reward_eligible BOOLEAN

created_at TIMESTAMPTZ

PK (user_id, problem_key)
```

## 13.9. `scoring_policies`

```text
version VARCHAR PK

level_decay NUMERIC
level_denominator NUMERIC
default_cc_base NUMERIC

reward_min NUMERIC
reward_max NUMERIC
reward_midpoint_delta NUMERIC
reward_scale NUMERIC

effective_from TIMESTAMPTZ
created_by UUID NULL
created_at TIMESTAMPTZ
```

## 13.10. `point_transactions`

```text
id UUID PK
user_id UUID FK
type ENUM
amount NUMERIC(12,2)

season_id UUID NULL FK
source_submission_id BIGINT NULL FK
source_reward_order_id UUID NULL FK

cc_level_before NUMERIC(10,2) NULL
problem_rating_snapshot INT NULL
scoring_policy_version VARCHAR NULL

description TEXT NULL
metadata JSONB

created_at TIMESTAMPTZ
```

Constraints:

```text
amount != 0
```

Unique cho reward EARN theo source submission/solve.

## 13.11. `user_wallets`

```text
user_id UUID PK FK
balance NUMERIC(12,2)
updated_at TIMESTAMPTZ
```

Không đặt DB constraint `balance >= 0` tuyệt đối, vì `REVERSAL`/`PENALTY` hợp lệ có thể làm balance âm sau khi user đã tiêu point trước đó.

Rule nghiệp vụ:

```text
REDEEM không bao giờ được làm balance < 0
REVERSAL/PENALTY có thể làm balance < 0
user có balance <= 0 không được redeem thêm
```

## 13.12. `seasons`

```text
id UUID PK
organization_id UUID NULL FK
name VARCHAR
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ
status ENUM
scoring_policy_version VARCHAR FK
created_at TIMESTAMPTZ
```

## 13.13. `season_user_totals`

```text
season_id UUID FK
user_id UUID FK

earned NUMERIC(12,2)
bonus NUMERIC(12,2)
penalty NUMERIC(12,2)
score NUMERIC(12,2)
qualifying_solves INT
reached_score_at TIMESTAMPTZ NULL

updated_at TIMESTAMPTZ

PK (season_id, user_id)
```

## 13.14. `rewards`

```text
id UUID PK
name VARCHAR
description TEXT
cost NUMERIC(12,2)
stock INT NULL
active BOOLEAN
image_url TEXT NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 13.15. `reward_orders`

```text
id UUID PK
user_id UUID FK
reward_id UUID FK
cost_snapshot NUMERIC(12,2)
status ENUM

created_at TIMESTAMPTZ
reviewed_at TIMESTAMPTZ NULL
reviewed_by UUID NULL
note TEXT NULL
```

## 13.16. `audit_logs`

Dành cho hành vi admin/teacher:

```text
id UUID PK
actor_user_id UUID
action VARCHAR
entity_type VARCHAR
entity_id VARCHAR
before JSONB NULL
after JSONB NULL
reason TEXT NULL
created_at TIMESTAMPTZ
```

---

# 14. Indexes quan trọng

Tối thiểu:

```text
codeforces_accounts(handle) UNIQUE
codeforces_accounts(next_sync_at) WHERE account active

cf_submissions(user_id, creation_time DESC)
cf_submissions(user_id, cf_submission_id DESC)

user_problem_solves(user_id, first_solved_at DESC)

point_transactions(user_id, created_at DESC)
point_transactions(season_id, user_id, created_at)
point_transactions(source_submission_id) cho EARN uniqueness

organization_memberships(user_id, organization_id)

season_user_totals(season_id, score DESC)
reward_orders(user_id, created_at DESC)
```

Không tạo index cho mọi column.

Theo dõi query plan trước khi thêm index mới.

---

# 15. Transaction boundaries

## 15.1. Process một first solve

Trong một DB transaction:

1. Upsert submission.
2. Attempt insert `user_problem_solves`.
3. Nếu conflict → đã solve, dừng reward.
4. Lock/read skill state.
5. Ghi `L_before`.
6. Nếu reward eligible và rated → tính point.
7. Insert EARN ledger.
8. Update wallet.
9. Update season aggregate.
10. Recompute/update `CC_Level`.
11. Commit.

Nếu bất kỳ bước nào fail:

```text
rollback toàn bộ
```

Worker retry sẽ an toàn nhờ unique constraints.

## 15.2. Batch nhiều solve

Không wrap hàng nghìn historical submission trong một transaction khổng lồ.

- ingest batch;
- process deterministic;
- checkpoint sau successful chunk.

Backfill cần resumable.

---

# 16. Public API nội bộ

## 16.1. User

```text
GET  /me
GET  /me/dashboard
GET  /me/activity
POST /me/sync
GET  /me/sync-status
```

## 16.2. Leaderboard

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

## 16.3. Rewards

```text
GET  /rewards
POST /rewards/:id/redeem
GET  /me/reward-orders
```

## 16.4. Organization

```text
GET  /organizations/:id
GET  /organizations/:id/members
```

Admin/Teacher:

```text
POST  /organizations
POST  /organizations/:id/members
PATCH /organizations/:id/members/:userId
```

## 16.5. Admin scoring

Không mở endpoint tùy ý sửa transaction amount.

Dùng command rõ nghĩa:

```text
POST /admin/users/:id/bonus
POST /admin/users/:id/penalty
POST /admin/users/:id/adjustment
POST /admin/users/:id/recalibrate-base
```

Mọi request phải có:

```text
reason
```

và audit.

---

# 17. UI/UX

## 17.1. Dashboard cá nhân

Hiển thị:

- `CC_Level`.
- progress tới vùng level cao hơn.
- Wallet Balance.
- Season Score.
- Current Streak.
- Longest Streak.
- number of qualifying solves.
- Radar/tag analytics.
- recent activity.
- recent transactions.
- last sync time.
- sync status.

Nút:

```text
Cập nhật Codeforces
```

Trạng thái:

```text
Sẵn sàng
Đang chờ
Đang đồng bộ
Hoàn tất
Tạm thời lỗi
```

## 17.2. Leaderboard

Filter:

- organization;
- season;
- page.

Columns gợi ý:

```text
Rank
Display Name
CC_Level
Season Score
Solved
Streak
```

Không xếp hạng theo wallet balance.

## 17.3. Reward Store

Grid:

- ảnh;
- tên;
- cost;
- stock;
- trạng thái.

Redeem cần confirmation UI nhưng backend vẫn phải chống double-submit.

## 17.4. Privacy cho học sinh

Public leaderboard mặc định nên dùng:

```text
display_name
```

Không public các dữ liệu không cần thiết như:

- email;
- internal user id;
- audit data;
- wallet transaction details;
- thông tin quản trị.

Có thể cấu hình việc hiển thị Codeforces handle theo organization policy.

---

# 18. Authorization Matrix

| Hành vi | Guest | Member | Teacher | Org Admin | System Admin |
|---|---:|---:|---:|---:|---:|
| Xem Public leaderboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem Closed leaderboard |  | ✓ | ✓ | ✓ | ✓ |
| Xem Private org mình thuộc |  | ✓ | ✓ | ✓ | ✓ |
| Xem Private org khác |  |  |  |  | ✓ |
| Sync account bản thân |  | ✓ | ✓ | ✓ | ✓ |
| Verify CF account |  |  | ✓ | ✓ | ✓ |
| Bonus/Penalty org member |  |  | theo policy | ✓ | ✓ |
| Quản lý reward |  |  | theo policy | ✓ | ✓ |
| Sửa scoring policy |  |  |  |  | ✓ |

Authorization phải enforce ở backend, không dựa vào UI ẩn nút.

---

# 19. Cache strategy

Có thể cache:

```text
public leaderboard
organization summary
dashboard read model
reward catalog
```

Không cache như source of truth:

```text
wallet balance for write
reward stock for write
first-solve uniqueness
authorization decision dài hạn
```

Gợi ý TTL:

```text
leaderboard: 15–60s
reward catalog: 30–120s
```

Invalidation sau transaction quan trọng là bonus, earn, redeem.

---

# 20. Observability

## 20.1. Metrics

Theo dõi:

```text
cf_api_requests_total
cf_api_failures_total
cf_call_limit_exceeded_total
sync_jobs_waiting
sync_jobs_active
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
leaderboard_cache_hit_ratio
```

## 20.2. Logging

Structured JSON logs.

Mỗi request/job có:

```text
request_id
job_id
user_id
cf_handle
```

Không log secret/token.

## 20.3. Alerts

Alert khi:

- call-limit-exceeded tăng liên tục;
- oldest sync job vượt SLA;
- worker không heartbeat;
- PostgreSQL unavailable;
- wallet reconciliation mismatch;
- disk gần đầy;
- backup thất bại.

---

# 21. Backup và recovery

## 21.1. PostgreSQL

Bắt buộc:

- automated backup;
- retention policy;
- periodic restore test.

Dữ liệu quan trọng nhất:

```text
users
memberships
solves
ledger
wallet
orders
scoring policy
```

## 21.2. Redis

Redis không phải source of truth.

Nếu Redis mất:

1. queue có thể mất;
2. API/worker khởi động lại;
3. scheduler đọc `next_sync_at` từ PostgreSQL;
4. enqueue lại account cần sync.

Không được có nghiệp vụ chỉ tồn tại trong Redis.

---

# 22. Security

Tối thiểu:

- HTTPS.
- Secure HTTP-only session cookie hoặc cơ chế auth tương đương.
- CSRF protection nếu dùng cookie-based auth.
- Password hash bằng thuật toán hiện đại nếu hệ thống tự giữ password.
- Rate limit endpoint login/sync/redeem.
- Validate mọi input.
- Parameterized SQL/ORM.
- Không expose Redis/PostgreSQL ra internet.
- Principle of least privilege cho DB user.
- Secrets qua environment/secret store, không commit vào repo.
- Audit admin actions.
- Dependency scanning.
- Container chạy non-root.

---

# 23. Các edge case phải định nghĩa

## 23.1. Unrated problem

```text
streak: có thể tính
CC_Level: không
CC_Point: không
```

## 23.2. Duplicate solve

Một problem nhiều `OK`:

```text
chỉ first solve lifetime được tính
```

## 23.3. Bài đã solve trước khi join

```text
dùng cho CC_Level
không phát reward
re-solve cũng không phát reward
```

## 23.4. Team solve

Default:

```text
không level
không point
```

## 23.5. Rejudge

Dùng `REVERSAL`, không sửa ledger cũ.

## 23.6. Rating quan sát thay đổi

Khi award, lưu:

```text
problem_rating_snapshot
```

Point cũ không đổi chỉ vì metadata problem được refresh sau đó.

Với historical backfill, Codeforces API không cung cấp một trường riêng bảo đảm đó là rating lịch sử tại đúng thời điểm submission. Vì vậy hệ thống lưu **rating quan sát được khi first-solve được hệ thống ingest/canonicalize**, rồi giữ snapshot đó ổn định về sau.

## 23.7. Handle đổi tên

Không tạo user mới.

Update Codeforces account mapping sau verification/admin action.

## 23.8. Account bị inactive

- giữ toàn bộ history;
- không scheduled sync;
- không xóa leaderboard lịch sử của closed season.

## 23.9. Season boundary

Dùng submission/transaction timestamp theo rule đã chốt, lưu UTC và convert timezone khi cần.

MVP khuyến nghị transaction thuộc season theo:

```text
first_solved_at
```

không theo thời điểm worker sync xong.

Như vậy queue delay không làm bài solve trước deadline bị sang season sau.

---

# 24. Quy tắc xác định season cho EARN

Với first solve:

```text
event_time = first_solved_at
```

Chọn season thỏa:

```text
start_at <= event_time < end_at
```

Không dùng:

```text
created_at của point transaction
```

vì đó chỉ là processing time.

Nếu submission được sync trễ:

- vẫn vào đúng season theo solve time;
- nếu season đã `CLOSED`, policy có thể:
  - cho phép late reconciliation tự động trong grace period;
  - sau grace period cần admin review.

Gợi ý:

```text
SEASON_RECONCILE_GRACE = 24h
```

---

# 25. Leaderboard fairness

Tie-break đề xuất:

1. `Season Score DESC`
2. `qualifying_solves DESC`
3. `CC_Level DESC`
4. `reached_score_at ASC`

Không dùng wallet balance.

Không dùng full historical CC_Point.

Closed season phải snapshot/freeze kết quả sau reconciliation grace period.

---

# 26. Data flow hoàn chỉnh

```text
User / Scheduler
      |
      v
POST sync / due account
      |
      v
BullMQ cf-sync
(dedup + global limiter)
      |
      v
Codeforces user.status
      |
      v
Normalize / Upsert Submissions
      |
      v
Detect first solves
      |
      v
Process ASC by solve time
      |
      +--> skill state L_before
      |
      +--> reward eligibility?
      |       |
      |       +-- no --> no EARN
      |       |
      |       +-- yes --> sigmoid reward
      |                      |
      |                      v
      |                immutable ledger
      |                      |
      |                wallet update
      |                      |
      |                season aggregate
      |
      v
Recompute CC_Level
      |
      v
Update sync checkpoint
      |
      v
Invalidate relevant cache
```

---

# 27. Deployment topology

## 27.1. MVP / một server

```text
Internet
   |
 Caddy
 ├── static React/Vite build
 └── /api/* → API
                 |
               Worker
              /      \
       PostgreSQL    Redis
```

Container thực tế:

```text
1. caddy
2. api
3. worker
4. postgres
5. redis
```

Không cần frontend Node runtime và không cần scheduler container riêng ở MVP.

## 27.2. Scale-up

Nếu web traffic tăng:

- scale API replicas;
- scale frontend/reverse proxy;
- có thể thêm worker replicas để tăng resilience.

Nhưng **Codeforces API rate vẫn là global bottleneck**, nên worker replicas không được làm tăng call rate.

## 27.3. Khi nào mới cần kiến trúc lớn hơn

Chỉ xem xét split service/orchestrator khi có ít nhất một trong:

- nhiều independent development teams;
- DB/CPU bottleneck rõ ràng;
- cần multi-region;
- SLA cao;
- workload analytics tách biệt rất lớn;
- một server không đủ.

Không tối ưu sớm.

---

# 28. Bộ config mặc định v2

```text
SCORING_POLICY_VERSION=v2.0

CC_DEFAULT_BASE=800
CC_LEVEL_DECAY=0.95
CC_LEVEL_DENOMINATOR=20

REWARD_MIN=0.05
REWARD_MAX=30.00
REWARD_MIDPOINT_DELTA=50
REWARD_SCALE=80

CF_GLOBAL_INTERVAL_MS=2200
SYNC_USER_COOLDOWN_SECONDS=120
SYNC_RECENT_RECONCILE_COUNT=100

SYNC_HOT_TARGET_HOURS=1
SYNC_WARM_TARGET_HOURS=6
SYNC_COLD_TARGET_HOURS=24

SEASON_RECONCILE_GRACE_HOURS=24

LEADERBOARD_CACHE_SECONDS=30
```

Các giá trị là **policy/config**, không rải magic number trong code.

---

# 29. Test plan bắt buộc

## 29.1. `CC_Level`

Property tests:

- thêm một first solve hợp lệ không được làm level giảm;
- permutation input không đổi result;
- duplicate problem không đổi result;
- unrated problem không đổi result;
- một bài cực khó không làm level nhảy trực tiếp tới rating bài đó.

Case:

```text
10 / 20 / 40 / 60 / 90 bài cùng rating
```

phải khớp công thức hội tụ.

## 29.2. Reward

Property tests:

```text
raw_reward(delta1) < raw_reward(delta2) nếu delta1 < delta2
stored_reward(delta1) <= stored_reward(delta2) nếu delta1 < delta2
reward >= 0.05
reward <= 30.00
```

Regression test các mốc:

```text
-500, -300, -200, -100, 0, +100, +200, +300, +500
```

## 29.3. Idempotency

Cùng một submission xử lý:

```text
1 lần
2 lần
10 lần
```

kết quả phải:

```text
1 first solve
1 EARN
1 wallet increment
1 season increment
```

## 29.4. Concurrent redeem

Hai request redeem song song với tổng cost > balance:

```text
tối đa một request thành công
```

không âm wallet.

## 29.5. Sync retry

Worker crash:

- trước DB commit;
- sau DB commit;
- trước checkpoint;
- sau checkpoint.

Kết quả cuối không duplicate.

## 29.6. Backfill

- History dựng level.
- Không phát EARN.
- Bài cũ re-solve không phát EARN.
- Bài mới sau eligibility phát đúng một EARN.

## 29.7. Season boundary

Test:

```text
start_at - 1ms
start_at
end_at - 1ms
end_at
```

## 29.8. Authorization

Test tất cả `PUBLIC / CLOSED / PRIVATE` với:

```text
guest
member
teacher
org admin
system admin
```

---

# 30. Acceptance criteria trước khi production

Hệ thống chỉ nên production khi đạt:

- [ ] Codeforces queue có global rate limit.
- [ ] Không có đường code nào gọi Codeforces trực tiếp ngoài sync client.
- [ ] Worker retry không duplicate point.
- [ ] First solve có DB unique constraint.
- [ ] EARN có DB uniqueness.
- [ ] Wallet redeem atomic.
- [ ] Backfill không award history.
- [ ] Leaderboard không phụ thuộc wallet balance.
- [ ] Season dùng event time, không dùng processing time.
- [ ] Admin adjustment có audit reason.
- [ ] Account phải verified trước reward.
- [ ] Private organization được test authorization.
- [ ] Backup PostgreSQL hoạt động.
- [ ] Restore test thành công.
- [ ] Metrics queue/API/DB có dashboard.
- [ ] Có alert khi Codeforces call limit exceeded.
- [ ] Có test deterministic cho scoring policy v2.
- [ ] Có staging environment.
- [ ] Container chạy non-root.
- [ ] Secrets không nằm trong source repository.

---

# 31. Thay đổi so với PRD v1

| Hạng mục | v1 | v2 |
|---|---|---|
| Node | Node 20 | Node 24 LTS |
| Docker base | ưu tiên Alpine | Debian slim/multi-stage mặc định |
| `CC_Base` mặc định | 0 | 800 |
| Level denominator | `max(20, sum w)` | `/20` |
| Reward | exponential + 3 vùng multiplier | bounded sigmoid |
| Reward cap | không | sigmoid + clamp, stored <= 30 |
| Reward level snapshot | chưa rõ | `CC_Level before solve` |
| History khi join | chưa rõ | level-only, không reward |
| First solve | lọc duplicate logic | canonical DB table + unique |
| Point storage | `Users.cc_point` | ledger + wallet |
| Leaderboard | dựa CC_Point chu kỳ | season aggregate từ ledger |
| Redeem | trừ point + log | atomic DB transaction |
| Sync rate | 2 req/s | 1 req / 2.2s safety config |
| Cron | sweep 3h/02:00 | `next_sync_at` capacity-aware |
| Job spam | cooldown | dedup + cooldown |
| Retry safety | chưa rõ | DB idempotency |
| Rejudge | chưa rõ | reconciliation + reversal |
| CF ownership | chưa rõ | verified account |
| Org member | user/org only | role/status/join/leave |
| Org structure | flat | optional hierarchy |
| Scoring changes | hard-coded | versioned policy |
| Privacy | visibility only | visibility + sanitized public display |

---

# 32. Những phần nên giữ nguyên tinh thần từ PRD v1

Các ý tưởng nền của v1 là đúng và nên giữ:

- tách `CC_Level` và `CC_Point`;
- dùng weighted top solved problems;
- chống farm bài dễ;
- giữ dữ liệu user inactive;
- organization visibility;
- PostgreSQL + Redis;
- BullMQ queue;
- on-demand sync;
- leaderboard theo organization/season;
- reward store;
- dark mode;
- activity timeline;
- tag analytics.

v2 chủ yếu làm các ý tưởng này:

```text
deterministic
idempotent
auditable
continuous
bounded
scalable
production-safe
```

---

# 33. Thứ tự triển khai đề xuất

## Phase 1 — Core data

1. Auth/User.
2. Organization/Membership.
3. Codeforces account verification.
4. Problem/Submission/Solve schema.
5. Initial backfill.
6. `CC_Level`.

## Phase 2 — Reward engine

1. Scoring policy.
2. Reward sigmoid.
3. Immutable ledger.
4. Wallet.
5. Season.
6. Leaderboard aggregate.
7. Idempotency tests.

## Phase 3 — Sync productionization

1. BullMQ queue.
2. Global rate limiter.
3. Dedup.
4. Incremental sync.
5. Adaptive scheduler.
6. Reconciliation.
7. Retry/backoff.
8. Metrics/alerts.

## Phase 4 — Product UI

1. Dashboard.
2. Leaderboard.
3. Timeline.
4. Streak.
5. Tag analytics.
6. Reward store.

## Phase 5 — Hardening

1. Authorization matrix.
2. Concurrent redeem tests.
3. Audit logs.
4. Backup/restore.
5. Staging.
6. Load test.
7. Security review.
8. Production deployment.

---

# 34. Kết luận thiết kế

Bản v2 tối ưu theo nguyên tắc:

> **PostgreSQL giữ sự thật; BullMQ chỉ điều phối; mỗi solve chỉ được công nhận một lần; mỗi thay đổi point có ledger; reward dùng level tại thời điểm solve; lịch sử xây level nhưng không tạo tiền; upstream Codeforces luôn bị giới hạn toàn cục.**

Hai thuật toán cốt lõi:

### Năng lực

\[
\boxed{
CC_{Level}
=
\max
\left(
CC_{Base},
\frac{1}{20}
\sum_{i=1}^{n}
D_i \cdot 0.95^{i-1}
\right)
}
\]

với `D_i` là rating các unique rated first-solves, sắp giảm dần.

### Điểm thưởng

\[
\boxed{
CC_{Point}
=
round
\left(
0.05
+
\frac{29.95}
{1 + e^{-((D-L)-50)/80}},
2
\right)
}
\]

với:

```text
D = problem rating snapshot
L = CC_Level trước first solve
```

Đây là cấu hình khởi đầu tốt cho production; các hằng số reward vẫn phải được hiệu chỉnh bằng dữ liệu thực sau một hoặc vài season, nhưng việc version hóa scoring policy bảo đảm có thể tune mà không phá lịch sử.

---

# 35. Nguồn đối chiếu chính thức

Tài liệu được kiểm tra lại ngày 18/08/2026.

## Codeforces

- API introduction và rate limit:  
  https://codeforces.com/apiHelp/

- API methods (`user.status`, pagination, ordering):  
  https://codeforces.com/apiHelp/methods

- API objects (`Problem`, `Submission`, `Party`):  
  https://codeforces.com/apiHelp/objects

## BullMQ

- Global rate limit:  
  https://docs.bullmq.io/guide/queues/global-rate-limit

- Rate limiting:  
  https://docs.bullmq.io/guide/rate-limiting

- Deduplication:  
  https://docs.bullmq.io/guide/jobs/deduplication

- Job IDs:  
  https://docs.bullmq.io/guide/jobs/job-ids

- Retrying failing jobs:  
  https://docs.bullmq.io/guide/retrying-failing-jobs

- Going to production:  
  https://docs.bullmq.io/guide/going-to-production

## PostgreSQL

- Concurrency control:  
  https://www.postgresql.org/docs/current/mvcc.html

- Transaction isolation / row locking:  
  https://www.postgresql.org/docs/current/transaction-iso.html

- Index uniqueness:  
  https://www.postgresql.org/docs/current/index-unique-checks.html

## Node.js / Docker

- Node.js 24 LTS release line:  
  https://nodejs.org/en/blog/release/v24.17.0

- Node Docker Official Image:  
  https://github.com/nodejs/docker-node

- Docker Compose in production:  
  https://docs.docker.com/compose/how-tos/production/

---


---

# 36. Mô phỏng `CC_Level` và lộ trình tham khảo

> Phần này là **simulation/reference curriculum**, không phải constraint bắt buộc của scoring engine.  
> `CC_Level` chỉ nhìn vào tập unique rated first-solves và sắp rating giảm dần; thứ tự học theo thời gian không làm thay đổi kết quả cuối cùng.

Công thức:

\[
CC_{Level}
=
\max
\left(
CC_{Base},
\frac{1}{20}
\sum_{i=1}^{n}
D_i\cdot0.95^{i-1}
\right)
\]

## 36.1. Học sinh mới: từ nền 800 lên khoảng 1200

Giả sử:

```text
CC_Base = 800
```

Một curriculum cân đối:

```text
15 bài rating 800
15 bài rating 900
15 bài rating 1000
15 bài rating 1100
15 bài rating 1200
15 bài rating 1300
```

Kết quả:

| Đã hoàn thành tới mức | Tổng unique solve | `CC_Calculated` | `CC_Level` |
|---:|---:|---:|---:|
| 800 | 15 | 429.37 | 800.00 |
| 900 | 30 | 681.96 | 800.00 |
| 1000 | 45 | 852.65 | 852.65 |
| 1100 | 60 | 985.41 | 985.41 |
| 1200 | 75 | 1100.58 | 1100.58 |
| 1300 | 90 | 1207.61 | **1207.61** |

Interpretation:

- Chạm một vài bài 1200 không đồng nghĩa đã làm chủ 1200.
- Để hệ thống công nhận năng lực ổn định quanh 1200, học sinh cần có lượng solve đáng kể ở cả 1200 và vùng thử thách 1300.
- Khoảng `10–20 bài/mức` là guideline giáo dục hợp lý ở các mức đầu; không cần ép đúng số lượng.

Gợi ý vùng bài luyện tập tiếp theo:

\[
TargetDifficulty \approx CC_{Level} \text{ đến } CC_{Level}+200
\]

Ví dụ `CC_Level ≈ 1200` → ưu tiên bài `1200–1400`.

## 36.2. Học sinh đã thành thạo: Teacher setup 1500, tiến tới 1800

Giả sử:

```text
CC_Base = 1500
```

Curriculum tham khảo:

```text
16 bài rating 1500
16 bài rating 1600
16 bài rating 1700
16 bài rating 1800
16 bài rating 1900
```

Kết quả:

| Đã hoàn thành tới mức | Tổng unique solve | `CC_Calculated` | `CC_Level` |
|---:|---:|---:|---:|
| 1500 | 16 | 839.81 | 1500.00 |
| 1600 | 32 | 1265.42 | 1500.00 |
| 1700 | 48 | 1508.73 | 1508.73 |
| 1800 | 64 | 1671.80 | 1671.80 |
| 1900 | 80 | 1799.56 | **1799.56** |

`CC_Base = 1500` có nghĩa giáo viên xác nhận nền tảng ban đầu của học sinh ở khoảng 1500.

Nó **không tạo các solve giả** và không làm thay đổi tập bài thực tế.

Muốn `CC_Level` vượt 1500 và tiến tới 1800, học sinh vẫn phải tạo đủ bằng chứng mới ở các mức cao hơn.

## 36.3. Level 800 nhưng solve một số bài 1500, sau đó tiếp tục học quanh 1500

Giả sử ban đầu:

```text
CC_Base = 800
5 first-solves × rating 1500
```

Khi đó:

```text
CC_Calculated ≈ 339.33
CC_Level = 800
```

Năm bài khó bất thường chưa đủ để level nhảy lên 1500.

Sau đó học sinh tiếp tục giải quanh 1500. Trong mô phỏng, mỗi 10 bài mới gồm xấp xỉ:

```text
3 × 1400
4 × 1500
3 × 1600
```

Kết quả:

| Lịch sử | Tổng unique solve | `CC_Level` |
|---|---:|---:|
| `5 × 1500` | 5 | 800.00 |
| +10 bài quanh 1500 | 15 | 811.62 |
| +20 bài quanh 1500 | 35 | 1278.11 |
| +20 bài quanh 1500 | 55 | **1457.47** |

Interpretation:

```text
vài solve rất khó
!=
năng lực ổn định ở mức đó
```

Nhưng khi học sinh liên tục giải được lượng lớn bài `1400–1600`, `CC_Level` nhanh chóng hội tụ về vùng 1500.

Đây là hành vi mong muốn của anti-shock scoring.

## 36.4. Level 800, solve một số bài 1500 rồi quay lại chỉ làm bài quanh 900

Vẫn bắt đầu với:

```text
5 × 1500
```

sau đó chỉ thêm bài rating 900.

| Bài 1500 | Bài 900 | Tổng unique solve | `CC_Level` |
|---:|---:|---:|---:|
| 5 | 0 | 5 | 800.00 |
| 5 | 10 | 15 | 800.00 |
| 5 | 20 | 25 | 800.00 |
| 5 | 40 | 45 | 946.24 |
| 5 | 80 | 85 | 1024.23 |
| 5 | 160 | 165 | 1035.54 |

Ngay cả nếu tiếp tục giải vô hạn bài rating 900, với đúng 5 bài 1500 ban đầu:

\[
CC_{Level}\rightarrow 1035.73
\]

Do đó chiến lược:

```text
một vài bài cực khó
+
farm rất nhiều bài dễ
```

không thể tạo level 1500 giả.

## 36.5. Ý nghĩa giáo dục của `CC_Level`

Không diễn giải:

```text
CC_Level = X
→ chỉ nên giải bài rating X
```

Nên diễn giải:

```text
CC_Level ≈ X
→ đã có bằng chứng tương đối ổn định rằng X nằm trong vùng năng lực hiện tại.
```

Vùng luyện tập chính tham khảo:

| `CC_Level` | Vùng luyện tập chính |
|---:|---:|
| 800 | 800–1000 |
| 900 | 900–1100 |
| 1000 | 1000–1200 |
| 1100 | 1100–1300 |
| 1200 | 1200–1400 |
| 1500 | 1500–1700 |
| 1800 | 1800–2000 |

---

# 37. Chu kỳ tháng, snapshot và cơ chế trao thưởng

## 37.1. Nguyên tắc

Kết thúc tháng/season **không reset**:

```text
CC_Level
CC_Base
first-solve history
wallet balance
lifetime statistics
```

Chỉ các metric thuộc season mới bắt đầu lại ở season tiếp theo.

Mô hình:

```text
Lifetime State
├── CC_Level
├── Wallet
├── All first-solves
├── Lifetime streak/statistics
└── ...

Season Aug-2026
├── Season Score
├── Active Days
├── Qualifying Solves
├── Level Growth
└── Awards

Season Sep-2026
├── Season Score
├── Active Days
├── Qualifying Solves
├── Level Growth
└── Awards
```

## 37.2. Các nhóm giải khuyến nghị

Không nên chỉ có một giải dựa trên tổng point.

Khuyến nghị 4 nhóm:

### A. Thành tích tháng — `Season Score`

\[
SeasonScore
=
\sum \text{leaderboard-affecting point transactions trong season}
\]

Giải:

```text
Top 1
Top 2
Top 3
```

### B. Tiến bộ nhất — `CC_Level Growth`

\[
LevelGrowth
=
CC_{Level,end}
-
CC_{Level,start}
\]

Giúp học sinh mới/trung bình vẫn có cơ hội được ghi nhận.

### C. Bền bỉ nhất — Consistency

Dựa trên:

```text
active_days
qualifying_solves
longest_streak_in_season
```

Có thể ưu tiên `active_days` để tránh khuyến khích spam số lượng bài trong một ngày.

### D. Bứt phá — Challenge Award

Với mỗi first solve:

\[
ChallengeDelta
=
D - CC_{Level,before}
\]

Season giữ:

```text
max_challenge_delta
```

Giải này ghi nhận một lần solve vượt trình nổi bật nhưng **không dùng nó để thay thế Season Score**.

## 37.3. Snapshot đầu/cuối season

Tạo bảng:

```text
season_user_snapshots
---------------------
season_id
user_id

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
created_at
updated_at
```

Unique:

```text
(season_id, user_id)
```

`cc_level_start` được chụp khi season bắt đầu hoặc khi user lần đầu đủ điều kiện tham gia season.

`cc_level_end` được finalize khi đóng season sau reconciliation grace period.

## 37.4. Awards

Tạo bảng riêng:

```text
season_awards
-------------
id UUID PK
season_id UUID FK
user_id UUID FK

award_type ENUM
rank INT NULL
title VARCHAR
reward_description TEXT NULL

awarded_at TIMESTAMPTZ
awarded_by UUID NULL
metadata JSONB
```

`award_type` ví dụ:

```text
TOP_SCORE
MOST_IMPROVED
MOST_CONSISTENT
CHALLENGE
CUSTOM
```

Monthly award là thành tích/giải do giáo viên trao, **không mặc định trừ wallet**.

## 37.5. Sang tháng mới

Ví dụ cuối tháng 8:

```text
CC_Level = 1170
Wallet = 420
Season Aug Score = 286.40
```

Sang tháng 9:

```text
CC_Level = 1170
Wallet = 420

Season Sep Score = 0
Season Sep Qualifying Solves = 0
Season Sep Active Days = 0
Season Sep Level Growth = 0
```

Tức:

```text
năng lực tiếp tục
ví tiền tiếp tục
lịch sử tiếp tục
season competition bắt đầu lại
```

## 37.6. Wallet và Season Score tuyệt đối không trộn

Ví dụ tháng 8:

```text
Earn trong season = +300
Redeem reward      = -100

Season Score       = 300
Wallet cuối tháng  = 200
```

Sang tháng 9:

```text
Season Score = 0
Wallet       = 200
```

Nếu tháng 9 kiếm thêm 120:

```text
Season Score tháng 9 = 120
Wallet                = 320
```

## 37.7. Đóng season

Flow:

1. `ACTIVE` → `CLOSING`.
2. Chờ `SEASON_RECONCILE_GRACE`.
3. Chạy reconciliation các account có activity sát boundary.
4. Rebuild/finalize `season_user_totals`.
5. Chụp `season_user_snapshots`.
6. Xác định rank và award.
7. `CLOSING` → `CLOSED`.
8. Cache/public leaderboard của season đã đóng có thể giữ lâu dài.

Sau khi `CLOSED`:

- không sửa snapshot thông thường;
- correction bắt buộc phải qua admin workflow + audit;
- nếu correction ảnh hưởng award/rank, lưu reason.

## 37.8. Tie-break monthly leaderboard

Khuyến nghị:

1. `Season Score DESC`
2. `qualifying_solves DESC`
3. `CC_Level_end DESC`
4. `reached_score_at ASC`

Đối với `MOST_IMPROVED`:

1. `cc_level_growth DESC`
2. `season_score DESC`
3. `qualifying_solves DESC`

Đối với `MOST_CONSISTENT`:

1. `active_days DESC`
2. `longest_streak DESC`
3. `qualifying_solves DESC`

---

# 38. Quy mô dự án và chiến lược phát triển bằng Codex

> Phần này là hướng dẫn triển khai, không phải business requirement.  
> Tài liệu OpenAI được kiểm tra lại ngày 18/08/2026.

## 38.1. Độ phức tạp

Dự án này **không phải hệ thống khổng lồ**, nhưng cũng không còn là CRUD web app đơn giản.

Đánh giá:

```text
Product scope:         Medium
Backend complexity:    Medium–High
Data correctness:      High
Distributed systems:   Medium
Frontend complexity:   Medium
Security/RBAC:         Medium
Operations:            Medium
Algorithm complexity:  Medium
```

Phần khó nhất không phải số lượng màn hình mà là **correctness**:

- sync external API có rate limit;
- worker retry/idempotency;
- first-solve uniqueness;
- scoring deterministic;
- immutable ledger;
- wallet concurrency;
- season boundary;
- reconciliation/rejudge;
- RBAC/privacy.

Với modular monolith, một developer mạnh hoặc team nhỏ hoàn toàn có thể xây dựng và vận hành.

Không nên chuyển sang microservices chỉ vì có queue/worker.

## 38.2. Model Codex khuyến nghị

Theo tài liệu OpenAI hiện tại, GPT-5.6 đã khả dụng trong Codex. Với dự án này, model mặc định nên là:

```text
GPT-5.6 Sol
```

Đây là lựa chọn mặc định khuyến nghị cho dự án.

## 38.3. Reasoning effort

Với picker hiện tại, dùng `Medium` cho phần lớn coding, `High` cho correctness-critical work, và `Extra High` cho các đợt audit/review khó nhất. Không cần bật Extra High liên tục.

Chiến lược đề xuất:

### `Medium` — mặc định hằng ngày

Dùng cho:

- CRUD/API endpoints;
- DTO/schema validation;
- React components;
- migrations nhỏ;
- unit tests đơn giản;
- styling;
- refactor cục bộ;
- documentation;
- fixing lint/type errors.

Đây nên là khoảng **70–80% công việc**.

### `High` — các phần correctness quan trọng

Dùng cho:

- thiết kế PostgreSQL schema;
- transaction boundaries;
- BullMQ idempotency;
- sync/checkpoint algorithm;
- scoring engine;
- season close/reconciliation;
- authorization;
- wallet/redeem concurrency;
- integration tests;
- review migration lớn.

Đây nên là mức mặc định cho các PR/backend change có thể ảnh hưởng point, wallet hoặc lịch sử.

### `Extra High` — review/architecture khó nhất

Dùng có chọn lọc cho:

- review kiến trúc toàn hệ thống;
- threat modeling;
- concurrency/race-condition audit;
- data migration có rủi ro cao;
- debugging lỗi production khó tái hiện;
- refactor xuyên nhiều module;
- final review trước production.

Không cần dùng `Extra High` cho mọi task vì tốc độ/chi phí reasoning không cần thiết cho code thường ngày.

## 38.4. Workflow khuyến nghị với Codex

Không giao một prompt kiểu:

```text
"Hãy code toàn bộ hệ thống này"
```

Thay vào đó chia theo vertical slice:

```text
01. Repo/bootstrap + CI
02. User/Auth
03. Organization/RBAC
04. Codeforces account verification
05. CF client + rate-limited queue
06. Submission ingestion
07. First-solve/idempotency
08. CC_Level engine
09. CC_Point/ledger/wallet
10. Seasons/leaderboard
11. Reward Store
12. Dashboard/UI
13. Reconciliation
14. Observability/backup/security
15. Production hardening
```

Mỗi slice yêu cầu Codex:

1. đọc PRD + `AGENTS.md`;
2. khảo sát code hiện tại;
3. viết/điều chỉnh test trước hoặc cùng implementation;
4. chạy test/typecheck/lint;
5. tự review diff;
6. báo assumptions và phần chưa hoàn thành.

## 38.5. Rule chọn reasoning nhanh

```text
Nếu lỗi có thể chỉ làm UI xấu
→ Medium

Nếu lỗi có thể cộng sai point / sai leaderboard / mất sync
→ High

Nếu lỗi có thể làm sai wallet / duplicate reward / hỏng migration /
leak quyền / corrupt dữ liệu production
→ High trước khi code + xhigh khi review nếu thay đổi lớn
```

## 38.6. Khuyến nghị thực tế

Cấu hình làm việc:

```text
Model mặc định:       GPT-5.6 Sol
Reasoning mặc định:   Medium

Backend critical:     High
Architecture review:  High/Extra High
Security/concurrency: Extra High khi cần
UI/routine code:      Medium
```

Không nên giữ `xhigh` 100% thời gian.

Điểm hiệu quả nhất là **dùng reasoning cao đúng nơi correctness quan trọng**, đồng thời chia task nhỏ, có tests và acceptance criteria rõ ràng.

## 38.7. Nguồn OpenAI

- GPT-5.6 Sol announcement:  
  https://openai.com/index/introducing-gpt-5-3-codex/

- GPT-5.6 Sol developer guide:  
  https://developers.openai.com/api/docs/guides/latest-model/gpt-5.3-codex

- Codex with ChatGPT plans:  
  https://help.openai.com/en/articles/11369540-openai-codex




---

# 39. Final Architecture Decision Record — tối ưu lần cuối

> Rà soát công nghệ ngày 18/08/2026.  
> Mục tiêu của lần chốt này: **hiện đại, tiết kiệm tài nguyên, dễ bảo trì, correctness cao, không over-engineer**.

## 39.1. Stack cuối cùng

```text
Frontend
--------
React 19.2
TypeScript
Vite 8.x
Tailwind CSS 4.x
TanStack Query
React Router

Backend
-------
Node.js 24 LTS
NestJS
TypeScript
Drizzle ORM
REST/OpenAPI

Data
----
PostgreSQL 18.x
Redis
BullMQ

Edge / Deployment
-----------------
Caddy
Docker Compose
Debian-slim Node images
```

Production phải pin dependency bằng lockfile và dùng latest stable patch/security update trong major/minor line đã chọn.

## 39.2. Những công nghệ cố ý KHÔNG dùng

MVP không dùng:

```text
Next.js SSR
Kubernetes
Microservices
Kafka
RabbitMQ
MongoDB
Elasticsearch
Redis Stack/Search
GraphQL
Service mesh
Event sourcing framework
Dedicated scheduler service
Dedicated frontend Node server
```

Lý do chung:

> Chưa có workload hoặc business requirement nào trả được chi phí vận hành/complexity của chúng.

Immutable point ledger là một **domain ledger**, không đồng nghĩa phải triển khai full event sourcing.

## 39.3. Resource-efficient topology

```text
                    ┌────────────────────┐
Internet ──────────►│ Caddy              │
                    │ TLS + static SPA   │
                    └────────┬───────────┘
                             │ /api
                             ▼
                    ┌────────────────────┐
                    │ NestJS API         │
                    └────────┬───────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    PostgreSQL           Redis/BullMQ       API response
          ▲                  │
          │                  ▼
          └──────────── NestJS Worker
                         │
                         ▼
                    Codeforces API
```

Mỗi responsibility có một lý do rõ ràng; không có service chỉ để “chia cho đẹp”.

## 39.4. VPS khởi đầu

Khuyến nghị ban đầu cho một deployment trường/lớp đến vài nghìn account:

```text
2–4 vCPU
4 GB RAM
40–80 GB SSD
```

Đây là sizing khởi đầu, không phải SLA guarantee.

Scale theo metrics thực tế:

- PostgreSQL memory/IO;
- API p95 latency;
- queue oldest-job-age;
- DB connections;
- disk growth;
- Codeforces sync capacity.

Do Codeforces có upstream API limit rất thấp, tăng CPU thường không làm sync nhanh tuyến tính.

## 39.5. Connection pooling

Không mở quá nhiều PostgreSQL connection chỉ vì Node xử lý concurrent request tốt.

MVP:

```text
API pool    ~ 5–10 connections
Worker pool ~ 3–5 connections
```

Điều chỉnh bằng metrics.

Chưa cần PgBouncer trên một VPS nhỏ. Thêm PgBouncer khi:

- nhiều API replicas;
- connection count trở thành bottleneck;
- deploy architecture bắt đầu scale ngang.

## 39.6. Worker concurrency

BullMQ worker có thể có concurrency > 1 cho các bước DB/processing, nhưng call Codeforces vẫn bị **global rate limit**.

Khuyến nghị bắt đầu:

```text
worker concurrency = 4
cf global rate      = 1 job / 2200 ms
```

Nếu một job có nhiều page API, limiter phải bao quanh **mỗi upstream request**, không chỉ mỗi job, để không vượt quota trong một backfill dài.

Đây là refinement quan trọng so với cách hiểu “1 job = 1 API call”.

## 39.7. Backfill queue isolation

Không để initial backfill của một account lớn chặn mọi on-demand sync.

Dùng cùng global upstream budget nhưng có hai logical priority:

```text
HIGH   → on-demand / recent sync
LOW    → initial backfill / reconciliation lớn
```

Có thể triển khai bằng job priority hoặc hai queue dùng chung một central/global upstream limiter.

Nguyên tắc:

```text
interactive freshness > historical backfill speed
```

Nhưng fairness vẫn cần giới hạn để low-priority job không starvation vô hạn.

## 39.8. Database-first scheduler

Scheduler không cần service riêng.

Worker chạy lightweight scheduling loop:

1. Acquire PostgreSQL advisory lock hoặc Redis short lock.
2. Query account `next_sync_at <= now()`.
3. Enqueue một batch nhỏ.
4. Release lock.
5. Sleep/repeat.

`next_sync_at` nằm ở PostgreSQL.

Nếu worker chết:

```text
scheduler state không mất
```

## 39.9. Cache tối thiểu

Không cache trước khi có bottleneck.

Bắt đầu chỉ cache:

```text
public leaderboard: 30 s
reward catalog:      60 s
```

Dashboard cá nhân có thể đọc trực tiếp PostgreSQL với index đúng.

Không cache wallet write path.

Không cache authorization result dài hạn.

## 39.10. Database choices

Ưu tiên PostgreSQL native feature trước khi thêm infrastructure:

- UUID/UUIDv7 nếu phù hợp;
- unique/partial index;
- `INSERT ... ON CONFLICT`;
- row locks;
- CTE;
- `NUMERIC`;
- `TIMESTAMPTZ`;
- JSONB metadata;
- materialized/read-model table chỉ khi có benchmark chứng minh cần.

Không dùng JSONB để nhét toàn bộ domain object vào một column.

## 39.11. Observability tối giản

MVP không cần Prometheus/Grafana stack nếu tài nguyên rất hạn chế.

Tối thiểu phải có:

- structured JSON logs;
- `/health/live`;
- `/health/ready`;
- queue metrics endpoint hoặc admin dashboard;
- error tracking;
- uptime monitoring;
- PostgreSQL/host basic monitoring.

Khi production ổn và cần dashboard dài hạn, mới thêm Prometheus/Grafana hoặc dịch vụ monitoring bên ngoài.

## 39.12. Frontend performance

SPA phải:

- route-level lazy loading;
- tránh bundle chart library vào initial chunk nếu dashboard chưa cần;
- cache server state bằng TanStack Query;
- pagination leaderboard/activity;
- không tải toàn bộ lịch sử solve vào browser;
- dùng chart chỉ khi có giá trị thực.

Caddy có thể cache static fingerprinted assets lâu dài:

```text
Cache-Control: public, max-age=31536000, immutable
```

`index.html` dùng cache ngắn/no-cache để nhận deployment mới.

## 39.13. Security/resource hardening

Production container:

- non-root;
- read-only filesystem nơi hợp lý;
- memory/CPU limits đủ rộng để tránh accidental runaway;
- Redis/PostgreSQL không expose public port;
- Caddy là ingress public duy nhất;
- secret không bake vào image;
- database backup nằm ngoài cùng VPS nếu có thể.

## 39.14. Upgrade policy

Không auto-upgrade major version trong production.

Policy:

```text
Patch security update:
→ review + staging + deploy sớm

Minor compatible update:
→ định kỳ

Major framework/runtime update:
→ branch riêng + test suite + migration guide
```

Node 24 và PostgreSQL 18 được giữ ổn định trong vòng đời dự án hiện tại thay vì đổi major liên tục.

## 39.15. Codex workflow cuối cùng

Với menu hiện tại:

```text
Default:
GPT-5.6 Sol + High
```

Nếu muốn tối ưu quota/tốc độ:

```text
Routine UI/CRUD/test:
GPT-5.6 Terra + Medium

Core scoring/DB/queue:
GPT-5.6 Sol + High

Architecture, concurrency,
security, migration review:
GPT-5.6 Sol + Extra High
```

Không giao toàn dự án trong một prompt.

Mỗi task Codex phải có:

```text
scope
acceptance criteria
relevant PRD section
tests to pass
files/modules allowed to change
non-goals
```

Trước khi merge phần critical:

1. chạy unit/integration tests;
2. typecheck/lint;
3. database migration review;
4. Codex self-review ở High/Extra High;
5. human review các invariant tiền/điểm/quyền.

## 39.16. Kết luận tối ưu

Kiến trúc cuối cùng ưu tiên:

```text
boring infrastructure
+
strong database constraints
+
small number of processes
+
versioned scoring
+
idempotent workers
+
measured scaling
```

Không có dấu hiệu hiện tại cho thấy dự án cần kiến trúc lớn hơn modular monolith.

Nếu quy mô tăng mạnh, hướng scale đầu tiên là:

```text
1. managed/external PostgreSQL hoặc VPS DB mạnh hơn
2. API replicas
3. worker replicas
4. PgBouncer
5. separate monitoring
```

chứ **không phải microservices trước**.

---

# 40. Nguồn kỹ thuật cập nhật cho lần tối ưu cuối

Kiểm tra ngày 18/08/2026:

## Runtime / Database

- Node.js 24 release archive / latest v24.x:  
  https://nodejs.org/en/download/archive/v24.0.0  
  https://nodejs.org/download/release/latest-v24.x/

- PostgreSQL 18.6 release notes:  
  https://www.postgresql.org/docs/current/release-18-6.html

- PostgreSQL 18 release overview:  
  https://www.postgresql.org/docs/release/18/

## Frontend

- React versions:  
  https://react.dev/versions

- React 19.2 announcement:  
  https://react.dev/blog

- Vite:  
  https://vite.dev/

- Vite releases:  
  https://vite.dev/releases

- Tailwind CSS v4 compatibility/install:  
  https://tailwindcss.com/docs/compatibility  
  https://tailwindcss.com/docs/installation/using-vite

## Edge

- Caddy automatic HTTPS:  
  https://caddyserver.com/docs/automatic-https

- Caddy static/reverse proxy patterns:  
  https://caddyserver.com/docs/caddyfile/patterns

## Queue

- BullMQ global rate limit:  
  https://docs.bullmq.io/guide/queues/global-rate-limit

- BullMQ rate limiting:  
  https://docs.bullmq.io/guide/rate-limiting

## Codex / OpenAI

- GPT-5.6:  
  https://openai.com/index/gpt-5-6/

**End of PRD v2.1 — Final Optimized Architecture**
