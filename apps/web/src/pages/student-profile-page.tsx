import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LevelRankBadge,
  LoadingState,
  StudentName,
} from '../components/ui';
import { api, formatDate, formatNumber, formatVnd, useSession } from '../lib/api';

interface StudentProfile {
  profile: {
    id: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    codeforces_handle: string | null;
    current_rating: number | null;
    max_rating: number | null;
    codeforces_rank: string | null;
    codeforces_max_rank: string | null;
    cc_level: string;
    activity_risk_level: 'NORMAL' | 'REVIEW' | 'PRIORITY';
    activity_risk_score: number;
    activity_risk_signals: string[];
    cc_point: string;
    cc_balance: string;
    cash_received_vnd: string;
    total_solves: number;
    solves_last_30_days: number;
    highest_problem_rating: number | null;
    highest_problem_name: string | null;
    classes: string[];
    level_rank_name: string | null;
    level_rank_icon: string | null;
    level_rank_color: string | null;
  };
  streak: {
    current_streak: number;
    longest_streak: number;
    next_bonus: number;
    settled_bonus: number;
    timeline: {
      date: string;
      kind: 'SOLVE' | 'RESCUE';
      problemName: string | null;
      problemRating: number | null;
      submissionId: string | null;
      codeforcesUrl: string | null;
      mascotName: string | null;
      mascotImageUrl: string | null;
      bonusAmount: number;
    }[];
    rescue: {
      missingDates: string[];
      requiredMascots: number;
      available: boolean;
      maxDays: number;
      mascots: {
        order_id: string;
        reward_id: string;
        name: string;
        image_url: string | null;
        acquired_at: string;
      }[];
    };
    bonus_milestones: { days: number; ccPoint: number }[];
  };
  awards: { award_type: string; title: string; season_name: string; awarded_at: string }[];
  achievements: {
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: string;
    color: string;
    required_longest_streak: number;
    source: string;
  }[];
  rewards: {
    id: string;
    name: string;
    description: string;
    image_url: string | null;
    cash_value_vnd: number | null;
    earned_at: string;
    category: string;
    quantity: number;
  }[];
  topTags: { tag: string; solved_count: number; max_rating: number | null }[];
  pointHistory: PointHistoryItem[];
}

interface PointHistoryItem {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  event_at: string;
  source_submission_id: string | null;
  source_reward_order_id: string | null;
  problem_rating_snapshot: number | null;
  programming_language: string | null;
  problem_key: string | null;
  contest_id: string | null;
  problem_index: string | null;
  problem_name: string | null;
  reward_name: string | null;
  cc_level_before: string | null;
  cc_level_after: string | null;
  cc_point_delta: string;
  cc_balance_delta: string;
  cc_point_after: string;
  cc_balance_after: string;
}

type PointHistoryMetric = 'ALL' | 'CC_LEVEL' | 'CC_POINT' | 'CC_BALANCE';

interface PointHistoryResponse {
  items: PointHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  metric: PointHistoryMetric;
}

const pointHistoryFilters: { value: PointHistoryMetric; label: string; icon: string }[] = [
  { value: 'ALL', label: 'Tất cả', icon: '◎' },
  { value: 'CC_LEVEL', label: 'CC Level', icon: '⚡' },
  { value: 'CC_POINT', label: 'CC Point', icon: '◆' },
  { value: 'CC_BALANCE', label: 'CC Balance', icon: '◈' },
];

export default function StudentProfilePage() {
  const { userId = '' } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const [selectedMascots, setSelectedMascots] = useState<string[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMetric, setHistoryMetric] = useState<PointHistoryMetric>('ALL');
  const student = useQuery({
    queryKey: ['student-profile', userId],
    queryFn: () => api<StudentProfile>(`/students/${userId}/profile`),
    enabled: Boolean(userId),
    refetchInterval: 15_000,
  });
  const canViewPointHistory = Boolean(
    session.data &&
    (session.data.user.userId === userId || session.data.user.systemRole !== 'USER'),
  );
  const history = useQuery({
    queryKey: ['student-point-history', userId, historyPage, historyMetric],
    queryFn: () =>
      api<PointHistoryResponse>(
        `/students/${userId}/point-history?page=${historyPage}&pageSize=20&metric=${historyMetric}`,
      ),
    enabled: Boolean(userId) && canViewPointHistory,
    placeholderData: (previous) => previous,
  });
  const rescue = useMutation({
    mutationFn: () =>
      api('/me/streak/rescue', {
        method: 'POST',
        body: JSON.stringify({ rewardOrderIds: selectedMascots }),
      }),
    onSuccess: async () => {
      setSelectedMascots([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-profile', userId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
      ]);
    },
  });
  if (student.isPending) return <LoadingState label="Đang tải hồ sơ học sinh…" fullPage />;
  if (student.error)
    return <ErrorState error={student.error} retry={() => void student.refetch()} />;
  if (!student.data)
    return <EmptyState title="Không tìm thấy học sinh" detail="Hồ sơ không còn khả dụng." />;
  const { profile, streak, achievements, rewards, topTags } = student.data;
  const isOwner = session.data?.user.userId === profile.id;
  const pointHistory = history.data?.items ?? student.data.pointHistory;
  const historyPagination = history.data?.pagination ?? {
    page: 1,
    pageSize: 20,
    total: student.data.pointHistory.length,
    totalPages: 1,
  };
  const historyPages = paginationPages(historyPagination.page, historyPagination.totalPages);
  const rank = profile.level_rank_name
    ? {
        name: profile.level_rank_name,
        icon: profile.level_rank_icon,
        color: profile.level_rank_color,
      }
    : null;
  const accent = profile.level_rank_color ?? '#ec4899';
  return (
    <main className="student-profile-page" style={{ '--student-accent': accent } as CSSProperties}>
      <header className="student-profile-topbar">
        <Link className="brand" to="/">
          <img alt="" className="brand-logo" src="/brand/cay-code-logo.webp" />
          <span>
            <strong>Cầy Cốt</strong>
            <small>MrTee.VN</small>
          </span>
        </Link>
        <Link className="button-secondary" to="/leaderboard">
          ← Bảng xếp hạng
        </Link>
      </header>
      <section className="student-profile-shell">
        <div className="student-profile-hero panel">
          <div className="student-rank-watermark" aria-hidden>
            {profile.level_rank_icon ?? '✦'}
          </div>
          <Avatar
            name={profile.display_name}
            rating={profile.current_rating}
            size="xl"
            url={profile.avatar_url}
          />
          <div className="student-profile-identity">
            <p className="eyebrow">HỒ SƠ HỌC SINH</p>
            <h1>
              <StudentName name={profile.display_name} rating={profile.current_rating} />
            </h1>
            <p>{profile.full_name}</p>
            <div className="student-profile-badges">
              <LevelRankBadge rank={rank} />
              {profile.codeforces_handle && (
                <CodeforcesHandle
                  handle={profile.codeforces_handle}
                  rating={profile.current_rating}
                />
              )}
              {profile.activity_risk_level && profile.activity_risk_level !== 'NORMAL' && (
                <span
                  className={`activity-risk-badge ${profile.activity_risk_level.toLowerCase()}`}
                  title={(profile.activity_risk_signals ?? []).join('\n')}
                >
                  ⚠{' '}
                  {profile.activity_risk_level === 'PRIORITY'
                    ? 'Ưu tiên kiểm tra'
                    : 'Hoạt động cần kiểm tra'}
                </span>
              )}
            </div>
            <small>{profile.classes.length ? profile.classes.join(' · ') : 'Chưa xếp lớp'}</small>
          </div>
        </div>

        <section className="student-profile-metrics">
          <ProfileMetric
            icon="⚡"
            label="CC Level"
            value={formatNumber(profile.cc_level, 2)}
            note="Năng lực tích luỹ từ các bài rated"
          />
          <ProfileMetric
            icon="◆"
            label="CC Point"
            value={formatNumber(profile.cc_point, 2)}
            note="Tổng điểm thành tích"
          />
          <ProfileMetric
            icon="◈"
            label="CC Balance"
            value={formatNumber(profile.cc_balance, 2)}
            note="Số dư đổi quà"
          />
          <ProfileMetric
            icon="🔥"
            label="Streak"
            value={`${streak.current_streak} ngày`}
            note={`Kỷ lục ${streak.longest_streak} ngày`}
          />
        </section>

        <section className="panel streak-profile-panel p-6">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NHẬT KÝ STREAK</p>
              <h2>Bài đầu tiên được ghi nhận mỗi ngày</h2>
              <p>
                Hoàn thành ngày tiếp theo sẽ nhận{' '}
                <strong>{formatNumber(streak.next_bonus, 2)} CC Point</strong>; CC Balance tăng đúng
                số điểm này ngay sau khi đồng bộ.
              </p>
            </div>
            <div className="streak-bonus-summary">
              <span>Đã nhận từ Streak</span>
              <strong>◆ {formatNumber(streak.settled_bonus)} CC</strong>
            </div>
          </div>
          <div className="streak-milestones">
            {streak.bonus_milestones.map((milestone) => (
              <span key={milestone.days}>
                <strong>{milestone.days} ngày</strong>
                {milestone.ccPoint} CC Point
              </span>
            ))}
          </div>
          {streak.timeline.length ? (
            <div className="streak-day-table">
              <div className="streak-day-row header">
                <span>Ngày</span>
                <span>Ghi nhận đầu tiên</span>
                <span>Rating</span>
                <span>Thưởng ngày</span>
                <span>Minh chứng</span>
              </div>
              {[...streak.timeline].reverse().map((day) => (
                <div className={`streak-day-row ${day.kind.toLowerCase()}`} key={day.date}>
                  <strong>{formatProfileDay(day.date)}</strong>
                  <span className="streak-day-main">
                    {day.kind === 'SOLVE' ? (
                      <>
                        <b>✓ {day.problemName}</b>
                        <small>Accepted đầu tiên trong ngày</small>
                      </>
                    ) : (
                      <>
                        <b>🛡️ Ngày được bảo vệ</b>
                        <small>Hi sinh {day.mascotName}</small>
                      </>
                    )}
                  </span>
                  <span>{day.problemRating ?? '—'}</span>
                  <strong>
                    {day.kind === 'SOLVE' && day.bonusAmount > 0
                      ? `+${formatNumber(day.bonusAmount, 2)} CC`
                      : '—'}
                  </strong>
                  {day.codeforcesUrl ? (
                    <a
                      className="button-secondary"
                      href={day.codeforcesUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Mở Codeforces ↗
                    </a>
                  ) : (
                    <span className="streak-rescue-mark">Linh vật</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có ngày Streak"
              detail="Bài Accepted đầu tiên trong ngày sẽ xuất hiện tại đây."
            />
          )}

          {isOwner && streak.rescue.available && (
            <div className="streak-rescue-box">
              <div>
                <p className="eyebrow">CỨU CHUỖI</p>
                <h3>
                  Hi sinh {streak.rescue.requiredMascots} linh vật cho{' '}
                  {streak.rescue.requiredMascots} ngày bị thiếu
                </h3>
                <p>{streak.rescue.missingDates.map(formatProfileDay).join(' · ')}</p>
              </div>
              <div className="streak-mascot-inventory">
                {streak.rescue.mascots.map((mascot) => {
                  const checked = selectedMascots.includes(mascot.order_id);
                  const disabled =
                    !checked && selectedMascots.length >= streak.rescue.requiredMascots;
                  return (
                    <label className={checked ? 'selected' : ''} key={mascot.order_id}>
                      <input
                        checked={checked}
                        disabled={disabled}
                        onChange={() =>
                          setSelectedMascots((current) =>
                            checked
                              ? current.filter((id) => id !== mascot.order_id)
                              : [...current, mascot.order_id],
                          )
                        }
                        type="checkbox"
                      />
                      {mascot.image_url && <img alt="" src={mascot.image_url} />}
                      <strong>{mascot.name}</strong>
                    </label>
                  );
                })}
              </div>
              {streak.rescue.mascots.length < streak.rescue.requiredMascots ? (
                <p className="notice error">
                  Bạn chưa có đủ linh vật đã được giao. Có thể đổi thêm trong Cửa hàng phần thưởng.
                </p>
              ) : (
                <button
                  className="button-danger"
                  disabled={
                    selectedMascots.length !== streak.rescue.requiredMascots || rescue.isPending
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        `Hi sinh ${selectedMascots.length} linh vật để giữ Streak? Thao tác này không thể hoàn tác.`,
                      )
                    )
                      rescue.mutate();
                  }}
                  type="button"
                >
                  {rescue.isPending
                    ? 'Đang cứu chuỗi…'
                    : `Hi sinh ${streak.rescue.requiredMascots} linh vật`}
                </button>
              )}
              {rescue.error && <p className="notice error">{rescue.error.message}</p>}
            </div>
          )}
        </section>

        <div className="student-profile-grid">
          <section className="panel p-6">
            <p className="eyebrow">CODEFORCES</p>
            <h2>Dấu ấn luyện tập</h2>
            <div className="profile-fact-grid">
              <ProfileFact label="Bài đã giải" value={`${profile.total_solves} bài`} />
              <ProfileFact label="30 ngày gần nhất" value={`${profile.solves_last_30_days} bài`} />
              <ProfileFact
                label="Bài khó nhất"
                value={profile.highest_problem_rating ? `${profile.highest_problem_rating}` : '—'}
                detail={profile.highest_problem_name ?? 'Chưa có dữ liệu'}
              />
              <ProfileFact
                label="Rating CF cao nhất"
                value={profile.max_rating ? formatNumber(profile.max_rating) : 'Unrated'}
                {...(profile.codeforces_max_rank ? { detail: profile.codeforces_max_rank } : {})}
              />
              <ProfileFact label="Tiền đã nhận" value={formatVnd(profile.cash_received_vnd)} />
            </div>
            <h3 className="mt-6">Kỹ năng nổi bật</h3>
            <div className="student-tag-list">
              {topTags.length ? (
                topTags.map((tag) => (
                  <span key={tag.tag}>
                    <strong>{tag.tag}</strong>
                    <small>
                      {tag.solved_count} bài · max {tag.max_rating ?? '—'}
                    </small>
                  </span>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">Chưa đủ dữ liệu tag.</p>
              )}
            </div>
          </section>
          <section className="panel p-6">
            <p className="eyebrow">THÀNH TỰU</p>
            <h2>Danh hiệu và quà đã nhận</h2>
            <div className="student-achievement-list">
              {achievements.map((achievement) => (
                <article
                  className="student-title-achievement"
                  key={achievement.id}
                  style={{ '--achievement-color': achievement.color } as CSSProperties}
                >
                  {/^https?:\/\//i.test(achievement.icon) || achievement.icon.startsWith('/') ? (
                    <img alt={achievement.name} src={achievement.icon} />
                  ) : (
                    <span>{achievement.icon}</span>
                  )}
                  <div>
                    <strong>{achievement.name}</strong>
                    <p>
                      {achievementTierLabel(achievement.tier)} · Streak{' '}
                      {achievement.required_longest_streak} ngày
                    </p>
                  </div>
                </article>
              ))}
              {rewards.map((reward) =>
                reward.category === 'MASCOT' ? (
                  <article
                    aria-label={`${reward.name}, số lượng ${reward.quantity}`}
                    className="student-mascot-collection"
                    key={reward.id}
                    title={reward.name}
                  >
                    {reward.image_url ? (
                      <img alt={reward.name} src={reward.image_url} />
                    ) : (
                      <span>🐾</span>
                    )}
                    <b>×{reward.quantity}</b>
                  </article>
                ) : (
                  <article key={reward.id}>
                    {reward.image_url ? (
                      <img
                        className="student-reward-image"
                        alt={reward.name}
                        src={reward.image_url}
                      />
                    ) : (
                      <span>{reward.cash_value_vnd ? '💵' : '🎁'}</span>
                    )}
                    <div>
                      <strong>{reward.name}</strong>
                      <p>
                        {reward.cash_value_vnd
                          ? formatVnd(reward.cash_value_vnd)
                          : reward.description}{' '}
                        · {formatDate(reward.earned_at)}
                      </p>
                    </div>
                  </article>
                ),
              )}
              {!achievements.length && !rewards.length && (
                <p className="text-sm text-[var(--muted)]">
                  Những cột mốc mới sẽ xuất hiện tại đây.
                </p>
              )}
            </div>
          </section>
        </div>
        {canViewPointHistory && (
          <section className="panel point-history-panel p-6">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LỊCH SỬ ĐIỂM</p>
                <h2>Biến động CC Point và CC Balance</h2>
                <p>
                  Mỗi first-solve có rating đều làm tăng CC Level. Bài ngang hoặc cao hơn trình độ
                  tăng nhanh hơn; bài dễ vẫn tăng nhưng giảm dần. Bài đủ điều kiện thưởng cộng đồng
                  thời CC Point và CC Balance; bài unrated chỉ ghi nhận hoạt động và Streak.
                </p>
              </div>
              <strong>{historyPagination.total} giao dịch</strong>
            </div>
            <div className="point-history-filters" aria-label="Lọc lịch sử điểm">
              {pointHistoryFilters.map((filter) => (
                <button
                  className={historyMetric === filter.value ? 'active' : ''}
                  key={filter.value}
                  onClick={() => {
                    setHistoryMetric(filter.value);
                    setHistoryPage(1);
                  }}
                  type="button"
                >
                  <span>{filter.icon}</span>
                  {filter.label}
                </button>
              ))}
            </div>
            {history.isPending && !pointHistory.length ? (
              <LoadingState label="Đang tải lịch sử điểm…" />
            ) : pointHistory.length ? (
              <div className="point-history-table">
                <div className="point-history-row header">
                  <span>Thời gian</span>
                  <span>Bài giải / hoạt động</span>
                  <span>CC Level</span>
                  <span>CC Point</span>
                  <span>CC Balance</span>
                </div>
                {pointHistory.map((transaction) => (
                  <div className="point-history-row" key={transaction.id}>
                    <time>{formatDate(transaction.event_at)}</time>
                    <span className="point-history-activity">
                      {transaction.problem_name ? (
                        <a
                          href={codeforcesSubmissionUrl(transaction)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <strong>
                            {transaction.problem_index ? `${transaction.problem_index}. ` : ''}
                            {transaction.problem_name}
                          </strong>
                          <small>Mở bài nộp trên Codeforces ↗</small>
                        </a>
                      ) : (
                        <>
                          <strong>{pointTransactionLabel(transaction.type)}</strong>
                          <small>
                            {transaction.reward_name
                              ? `${transaction.description ?? 'Đổi quà'} · ${transaction.reward_name}`
                              : (transaction.description ?? 'Thay đổi điểm trong hệ thống')}
                          </small>
                        </>
                      )}
                      {transaction.problem_name && (
                        <small>
                          Rating {transaction.problem_rating_snapshot ?? 'Unrated'}
                          {transaction.programming_language
                            ? ` · ${transaction.programming_language}`
                            : ''}
                          {transaction.source_submission_id
                            ? ` · Submission #${transaction.source_submission_id}`
                            : ''}
                        </small>
                      )}
                    </span>
                    <span>
                      {transaction.cc_level_before && transaction.cc_level_after ? (
                        <>
                          <b>
                            {formatNumber(transaction.cc_level_before, 2)} →{' '}
                            {formatNumber(transaction.cc_level_after, 2)}
                          </b>
                          <small>
                            Thay đổi:{' '}
                            {signedPoint(
                              String(
                                Number(transaction.cc_level_after) -
                                  Number(transaction.cc_level_before),
                              ),
                            )}
                          </small>
                        </>
                      ) : (
                        <b>—</b>
                      )}
                    </span>
                    <span>
                      <b
                        className={
                          Number(transaction.cc_point_delta) >= 0 ? 'positive' : 'negative'
                        }
                      >
                        {signedPoint(transaction.cc_point_delta)}
                      </b>
                      <small>Sau giao dịch: {formatNumber(transaction.cc_point_after, 2)}</small>
                    </span>
                    <span>
                      <b
                        className={
                          Number(transaction.cc_balance_delta) >= 0 ? 'positive' : 'negative'
                        }
                      >
                        {signedPoint(transaction.cc_balance_delta)}
                      </b>
                      <small>Số dư: {formatNumber(transaction.cc_balance_after, 2)}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Chưa có thay đổi điểm"
                detail="Giao dịch CC Point và CC Balance sẽ xuất hiện tại đây."
              />
            )}
            {historyPagination.totalPages > 1 && (
              <nav className="point-history-pagination" aria-label="Phân trang lịch sử điểm">
                <button
                  disabled={historyPagination.page <= 1 || history.isFetching}
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  ← Trước
                </button>
                {historyPages.map((page) => (
                  <button
                    aria-current={page === historyPagination.page ? 'page' : undefined}
                    className={page === historyPagination.page ? 'active' : ''}
                    disabled={history.isFetching}
                    key={page}
                    onClick={() => setHistoryPage(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ))}
                <button
                  disabled={
                    historyPagination.page >= historyPagination.totalPages || history.isFetching
                  }
                  onClick={() =>
                    setHistoryPage((page) => Math.min(historyPagination.totalPages, page + 1))
                  }
                  type="button"
                >
                  Sau →
                </button>
              </nav>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function codeforcesSubmissionUrl(transaction: PointHistoryItem) {
  if (transaction.contest_id && transaction.source_submission_id) {
    return `https://codeforces.com/contest/${transaction.contest_id}/submission/${transaction.source_submission_id}`;
  }
  if (transaction.contest_id && transaction.problem_index) {
    return `https://codeforces.com/problemset/problem/${transaction.contest_id}/${transaction.problem_index}`;
  }
  return 'https://codeforces.com/problemset';
}

function paginationPages(current: number, total: number) {
  const count = Math.min(total, 5);
  const start = Math.max(1, Math.min(current - 2, total - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

function signedPoint(value: string) {
  const amount = Number(value);
  if (amount === 0) return '—';
  return `${amount > 0 ? '+' : '−'}${formatNumber(Math.abs(amount), 2)}`;
}

function pointTransactionLabel(type: string) {
  return (
    {
      EARN: 'Điểm từ bài giải',
      BONUS: 'Điểm thưởng',
      REDEEM: 'Đổi quà',
      REFUND: 'Hoàn điểm',
      PENALTY: 'Trừ điểm',
      REVERSAL: 'Điều chỉnh ngược',
      ADJUSTMENT: 'Hiệu chỉnh',
    }[type] ?? type
  );
}

function achievementTierLabel(tier: string) {
  return (
    {
      BRONZE: 'Đồng',
      SILVER: 'Bạc',
      GOLD: 'Vàng',
      PLATINUM: 'Bạch kim',
      DIAMOND: 'Kim cương',
      MASTER: 'Cao thủ',
      LEGEND: 'Huyền thoại',
    }[tier] ?? tier
  );
}

function formatProfileDay(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function ProfileMetric({
  icon,
  label,
  value,
  note,
}: {
  icon: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="panel">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

function ProfileFact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
