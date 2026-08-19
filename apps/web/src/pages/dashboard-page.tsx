import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber } from '../lib/api';
import { recommendedRange } from './dashboard-recommendation';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LoadingState,
  LevelRankBadge,
  PageTitle,
  StudentName,
} from '../components/ui';

interface Dashboard {
  profile: {
    display_name: string;
    avatar_url: string | null;
    codeforces_handle: string | null;
    verification_status: string | null;
    pending_handle: string | null;
    current_rating: number | null;
    codeforces_rank: string | null;
    sync_status: string | null;
    last_sync_at: string | null;
    cc_level: string;
    cc_point: string;
    wallet_balance: string;
    total_solves: number;
    highest_problem_rating: number | null;
    highest_problem_name: string | null;
    recent_five_average_rating: number | null;
    recent_five_rated_count: number;
  };
  season: { name: string; score: string; qualifying_solves: number } | null;
  streak: { current_streak: number; longest_streak: number };
  tags: {
    tag: string;
    solved_count: number;
    average_rating: string | null;
    max_rating: number | null;
  }[];
  activity: {
    problem_key: string;
    name: string;
    rating_snapshot: number | null;
    first_solved_at: string;
    tags: string[];
  }[];
  transactions: {
    id: string;
    type: string;
    amount: string;
    description: string | null;
    event_at: string;
  }[];
  awards: { award_type: string; title: string; season_name: string }[];
  fulfilledRewards: {
    name: string;
    description: string;
    image_url: string | null;
    earned_at: string;
  }[];
}

interface TopBoard {
  entries: {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    codeforcesHandle: string | null;
    currentRating: number | null;
    ccLevel: string;
    ccPoint: string;
    streak: number;
    levelRank: { name: string; icon: string | null; color: string | null } | null;
  }[];
}

interface DashboardContent {
  quotes: {
    id: string;
    content: string;
    author: string | null;
    sort_order: number;
    heart_count: number;
  }[];
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState('');
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/me/dashboard'),
    refetchInterval: 15_000,
  });
  const topLevel = useQuery({
    queryKey: ['dashboard-top', 'CC_LEVEL'],
    queryFn: () => api<TopBoard>('/leaderboards?sort=CC_LEVEL&pageSize=10'),
    refetchInterval: 15_000,
  });
  const topPoint = useQuery({
    queryKey: ['dashboard-top', 'CC_POINT'],
    queryFn: () => api<TopBoard>('/leaderboards?sort=CC_POINT&pageSize=10'),
    refetchInterval: 15_000,
  });
  const topStreak = useQuery({
    queryKey: ['dashboard-top', 'STREAK'],
    queryFn: () => api<TopBoard>('/leaderboards?sort=STREAK&pageSize=10'),
    refetchInterval: 15_000,
  });
  const dashboardContent = useQuery({
    queryKey: ['dashboard-content'],
    queryFn: () => api<DashboardContent>('/content/dashboard'),
    staleTime: 5 * 60_000,
  });
  const sync = useMutation({
    mutationFn: () => api('/me/sync', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  const link = useMutation({
    mutationFn: () =>
      api('/me/codeforces-account', { method: 'POST', body: JSON.stringify({ handle }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  if (dashboard.isPending) return <LoadingState label="Đang tổng hợp tiến độ…" />;
  if (dashboard.error || !dashboard.data)
    return <ErrorState error={dashboard.error} retry={() => void dashboard.refetch()} />;
  const data = dashboard.data;
  const profile = data.profile;
  const recommendation = recommendedRange(profile.recent_five_average_rating);
  const submitHandle = (event: FormEvent) => {
    event.preventDefault();
    link.mutate();
  };
  return (
    <>
      <PageTitle
        eyebrow="BẢNG ĐIỀU KHIỂN"
        title={`Chào ${profile.display_name}`}
        detail={<QuoteRotator quotes={dashboardContent.data?.quotes ?? []} />}
        action={
          <div className="dashboard-identity">
            <Avatar
              name={profile.display_name}
              rating={profile.current_rating}
              size="xl"
              url={profile.avatar_url}
            />
            <div>
              {profile.codeforces_handle ? (
                <CodeforcesHandle
                  handle={profile.codeforces_handle}
                  large
                  rating={profile.current_rating}
                />
              ) : (
                <strong>Chưa kết nối Codeforces</strong>
              )}
              <p>
                {profile.codeforces_rank ?? 'Unrated'} · Sync gần nhất:{' '}
                {formatDate(profile.last_sync_at)}
              </p>
              {profile.codeforces_handle && (
                <button
                  className="button-secondary mt-2"
                  disabled={sync.isPending}
                  onClick={() => sync.mutate()}
                  type="button"
                >
                  {sync.isPending ? 'Đang xếp hàng…' : '↻ Đồng bộ'}
                </button>
              )}
            </div>
          </div>
        }
      />
      {!profile.codeforces_handle && (
        <form
          className="panel mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-end"
          onSubmit={submitHandle}
        >
          <label className="field flex-1">
            <span>Kết nối Codeforces để bắt đầu</span>
            <input
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Codeforces handle"
              required
              value={handle}
            />
          </label>
          <button className="button-primary" disabled={link.isPending} type="submit">
            Kết nối tài khoản
          </button>
          {link.error && <p className="form-error">{link.error.message}</p>}
        </form>
      )}
      <section className="stats-grid">
        <Stat
          accent="cyan"
          icon="⚡"
          label="CC Level"
          value={formatNumber(profile.cc_level, 2)}
          note="Năng lực dài hạn"
        />
        <Stat
          accent="violet"
          icon="◆"
          label="CC Point"
          value={formatNumber(profile.cc_point, 2)}
          note="Tổng điểm thành tích"
        />
        <Stat
          accent="amber"
          icon="◈"
          label="CC Balance"
          value={formatNumber(profile.wallet_balance, 2)}
          note="Số dư có thể đổi quà"
        />
        <Stat
          accent="green"
          icon="🔥"
          label="Streak"
          value={`${data.streak.current_streak} ngày`}
          note={`Kỷ lục ${data.streak.longest_streak} ngày`}
        />
      </section>
      <section className="panel achievement-section mt-6 p-5">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACHIEVEMENTS</p>
            <h2>Danh hiệu & phần thưởng đã đạt</h2>
          </div>
          <span className="achievement-count">
            {data.awards.length + data.fulfilledRewards.length} thành tựu
          </span>
        </div>
        {data.awards.length === 0 && data.fulfilledRewards.length === 0 ? (
          <EmptyState
            title="Chưa mở khóa thành tựu"
            detail="Duy trì Streak, chinh phục thử thách và nâng CC Level để nhận huy chương."
          />
        ) : (
          <div className="achievement-grid">
            {data.awards.map((award) => (
              <article className="achievement-card" key={`${award.award_type}-${award.title}`}>
                <span className="achievement-icon">{awardIcon(award.award_type)}</span>
                <div>
                  <strong>{award.title}</strong>
                  <p>{award.season_name}</p>
                </div>
              </article>
            ))}
            {data.fulfilledRewards.map((reward) => (
              <article className="achievement-card reward-achievement" key={reward.name}>
                {reward.image_url ? (
                  <img
                    className="achievement-reward-image"
                    alt={reward.name}
                    src={reward.image_url}
                  />
                ) : (
                  <span className="achievement-icon">🎁</span>
                )}
                <div>
                  <strong>{reward.name}</strong>
                  <p>{reward.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="mt-6">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TOP 10 TOÀN HỆ THỐNG</p>
            <h2>Những học sinh nổi bật</h2>
          </div>
        </div>
        <div className="dashboard-leaderboards">
          <MiniLeaderboard
            icon="⚡"
            label="CC Level"
            loading={topLevel.isPending}
            rows={topLevel.data?.entries ?? []}
            value={(row) => formatNumber(row.ccLevel, 2)}
          />
          <MiniLeaderboard
            icon="◆"
            label="CC Point"
            loading={topPoint.isPending}
            rows={topPoint.data?.entries ?? []}
            value={(row) => formatNumber(row.ccPoint, 2)}
          />
          <MiniLeaderboard
            icon="🔥"
            label="Streak"
            loading={topStreak.isPending}
            rows={topStreak.data?.entries ?? []}
            value={(row) => `${row.streak} ngày`}
          />
        </div>
      </section>
      <section className="panel mt-6 p-5">
        <div className="section-heading">
          <div>
            <p className="eyebrow">HOẠT ĐỘNG</p>
            <h2>Bài giải gần đây</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">{profile.total_solves} bài duy nhất</span>
        </div>
        <div className="activity-summary">
          <div>
            <span>Đã hoàn thành</span>
            <strong>{profile.total_solves} bài</strong>
          </div>
          <div>
            <span>Bài khó nhất</span>
            <strong>{profile.highest_problem_rating ?? 'Chưa có rating'}</strong>
            <small>{profile.highest_problem_name ?? 'Đồng bộ bài giải để xem'}</small>
          </div>
          <div>
            <span>Khuyến nghị tiếp theo</span>
            {recommendation ? (
              <>
                <strong>
                  CF {recommendation.min}–{recommendation.max}
                </strong>
                <small>Vùng luyện tập cân bằng quanh phong độ gần đây</small>
              </>
            ) : (
              <>
                <strong>Chưa đủ dữ liệu</strong>
                <small className="recommendation-explain">
                  Hãy hoàn thành bài Codeforces có rating để hệ thống tính khuyến nghị.
                </small>
              </>
            )}
          </div>
        </div>
        {data.activity.length === 0 ? (
          <EmptyState
            title="Chưa có bài giải"
            detail="Bài AC cá nhân đầu tiên sẽ xuất hiện tại đây."
          />
        ) : (
          <div className="activity-grid">
            {data.activity.map((item) => (
              <article className="activity-card" key={item.problem_key}>
                <span className="activity-rating">{item.rating_snapshot ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-bold">{item.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.tags.slice(0, 3).join(' · ') || 'Chưa gắn tag'}
                  </p>
                  <p className="mb-0 mt-2 text-xs text-[var(--muted)]">
                    {formatDate(item.first_solved_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="panel mt-6 p-5">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NĂNG LỰC THEO TAG</p>
            <h2>Dấu chân kỹ năng</h2>
          </div>
        </div>
        {data.tags.length === 0 ? (
          <EmptyState
            title="Chưa đủ dữ liệu tag"
            detail="Đồng bộ lịch sử để mở khóa phân tích kỹ năng."
          />
        ) : (
          <div className="tag-grid">
            {data.tags.map((tag) => (
              <div className="tag-stat" key={tag.tag}>
                <div className="flex items-center justify-between">
                  <strong>{tag.tag}</strong>
                  <span>{tag.solved_count} bài</span>
                </div>
                <div className="tag-track">
                  <span style={{ width: `${Math.min(100, tag.solved_count * 10)}%` }} />
                </div>
                <p>
                  TB {formatNumber(tag.average_rating)} · Cao nhất {formatNumber(tag.max_rating)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function QuoteRotator({ quotes }: { quotes: DashboardContent['quotes'] }) {
  const fallback = {
    id: 'fallback',
    content: 'Một lát cắt gọn về năng lực, nhịp luyện tập và thành tích hiện tại của bạn.',
    author: null,
    heart_count: 0,
  };
  const queryClient = useQueryClient();
  const available = quotes.length ? quotes : [fallback];
  const [index, setIndex] = useState(0);
  const heart = useMutation({
    mutationFn: (id: string) =>
      api<{ heartCount: number }>(`/content/quotes/${id}/heart`, { method: 'POST' }),
    onSuccess: ({ heartCount }, id) => {
      queryClient.setQueryData<DashboardContent>(['dashboard-content'], (current) =>
        current
          ? {
              ...current,
              quotes: current.quotes.map((quote) =>
                quote.id === id ? { ...quote, heart_count: heartCount } : quote,
              ),
            }
          : current,
      );
    },
  });

  useEffect(() => {
    if (index >= available.length) setIndex(0);
  }, [available.length, index]);
  useEffect(() => {
    if (available.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % available.length);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [available.length]);

  const quote = available[index] ?? fallback;
  const next = () => {
    setIndex((current) => (current + 1) % available.length);
  };
  const previous = () => setIndex((current) => (current - 1 + available.length) % available.length);
  return (
    <div className="dashboard-quote">
      <div>
        <q>{quote.content}</q>
        {quote.author && <small>— {quote.author}</small>}
      </div>
      <div className="quote-actions" aria-label="Tương tác với danh ngôn">
        <button
          aria-label="Xem danh ngôn trước"
          className="quote-arrow-button"
          disabled={available.length < 2}
          onClick={previous}
          title="Câu trước"
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Thả tim câu này"
          className="quote-heart-button"
          disabled={quote.id === 'fallback' || heart.isPending}
          onClick={() => heart.mutate(quote.id)}
          title="Thả tim"
          type="button"
        >
          <span>♥</span>
          <small>{Math.min(999999, quote.heart_count)}</small>
        </button>
        <button
          aria-label="Xem danh ngôn tiếp theo"
          className="quote-arrow-button"
          disabled={available.length < 2}
          onClick={next}
          title="Câu tiếp theo"
          type="button"
        >
          →
        </button>
      </div>
    </div>
  );
}

type TopEntry = TopBoard['entries'][number];

function MiniLeaderboard({
  label,
  icon,
  rows,
  loading,
  value,
}: {
  label: string;
  icon: string;
  rows: TopEntry[];
  loading: boolean;
  value: (row: TopEntry) => string;
}) {
  return (
    <article className="panel mini-leaderboard">
      <div className="mini-leaderboard-title">
        <span aria-hidden>{icon}</span>
        <div>
          <p>BXH NỔI BẬT</p>
          <h3>TOP 10 {label}</h3>
        </div>
      </div>
      {loading ? (
        <p className="mini-leaderboard-empty">Đang tải bảng xếp hạng…</p>
      ) : rows.length === 0 ? (
        <p className="mini-leaderboard-empty">Chưa có dữ liệu học sinh.</p>
      ) : (
        <div>
          {rows.map((row) => (
            <div className="mini-rank-row" key={row.userId}>
              <span className="mini-rank-number">
                {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}
              </span>
              <Avatar
                name={row.displayName}
                rating={row.currentRating}
                size="sm"
                url={row.avatarUrl}
              />
              <div className="mini-rank-identity">
                <StudentName name={row.displayName} rating={row.currentRating} />
                <LevelRankBadge rank={row.levelRank} />
              </div>
              <b>{value(row)}</b>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  note,
  accent,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
  icon: string;
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-heading">
        <p>{label}</p>
        <span className="stat-icon" aria-hidden>
          {icon}
        </span>
      </div>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function awardIcon(type: string): string {
  return (
    {
      TOP_SCORE: '🏆',
      MOST_IMPROVED: '🚀',
      MOST_CONSISTENT: '🥇',
      CHALLENGE: '🛡️',
      CUSTOM: '⭐',
    }[type] ?? '🏅'
  );
}
