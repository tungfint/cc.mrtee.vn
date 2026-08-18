import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber } from '../lib/api';
import {
  Avatar,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusPill,
} from '../components/ui';

interface Dashboard {
  profile: {
    display_name: string;
    avatar_url: string | null;
    codeforces_handle: string | null;
    verification_status: string | null;
    sync_status: string | null;
    last_sync_at: string | null;
    cc_level: string;
    wallet_balance: string;
    total_solves: number;
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

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState('');
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/me/dashboard'),
    refetchInterval: 60_000,
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
  const submitHandle = (event: FormEvent) => {
    event.preventDefault();
    link.mutate();
  };
  return (
    <>
      <PageTitle
        eyebrow="BẢNG ĐIỀU KHIỂN"
        title={`Chào ${profile.display_name}`}
        detail="Một lát cắt gọn về năng lực, nhịp luyện tập và thành tích hiện tại của bạn."
        action={
          <div className="flex items-center gap-3">
            <Avatar name={profile.display_name} size="lg" url={profile.avatar_url} />
            <span className="text-xs text-[var(--muted)]">
              Sync gần nhất: {formatDate(profile.last_sync_at)}
            </span>
            {profile.codeforces_handle && (
              <button
                className="button-secondary"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
                type="button"
              >
                {sync.isPending ? 'Đang xếp hàng…' : '↻ Đồng bộ'}
              </button>
            )}
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
          value={formatNumber(profile.wallet_balance, 2)}
          note="Có thể dùng đổi thưởng"
        />
        <Stat
          accent="amber"
          icon="🏆"
          label="CC Current"
          value={formatNumber(data.season?.score, 2)}
          note={`${data.season?.name ?? 'Chưa có mùa'} · ${data.season?.qualifying_solves ?? 0} bài`}
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
            detail="Duy trì Streak, chinh phục thử thách và vươn lên CC Current để nhận huy chương."
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
                <span className="achievement-icon">🎁</span>
                <div>
                  <strong>{reward.name}</strong>
                  <p>{reward.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="panel p-5">
          <div className="section-heading">
            <div>
              <p className="eyebrow">HOẠT ĐỘNG</p>
              <h2>Bài giải gần đây</h2>
            </div>
            <span className="text-xs text-[var(--muted)]">{profile.total_solves} bài duy nhất</span>
          </div>
          {data.activity.length === 0 ? (
            <EmptyState
              title="Chưa có bài giải"
              detail="Bài AC cá nhân đầu tiên sẽ xuất hiện tại đây."
            />
          ) : (
            <div className="timeline">
              {data.activity.map((item) => (
                <article className="timeline-item" key={item.problem_key}>
                  <span className="timeline-dot" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="m-0 truncate font-bold">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {item.tags.slice(0, 3).join(' · ') || 'Chưa gắn tag'}
                        </p>
                      </div>
                      <strong className="font-mono text-sm text-[var(--accent)]">
                        {item.rating_snapshot ?? '—'}
                      </strong>
                    </div>
                    <p className="mb-0 mt-2 text-xs text-[var(--muted)]">
                      {formatDate(item.first_solved_at)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div className="panel p-5">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CODEFORCES</p>
                <h2>Trạng thái đồng bộ</h2>
              </div>
              {profile.sync_status && <StatusPill value={profile.sync_status} />}
            </div>
            <p className="text-2xl font-black">
              {profile.codeforces_handle ? `@${profile.codeforces_handle}` : 'Chưa kết nối'}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {profile.verification_status
                ? `Xác minh: ${profile.verification_status.replaceAll('_', ' ')}`
                : 'Cần kết nối handle'}
            </p>
          </div>
          <div className="panel p-5">
            <div className="section-heading">
              <div>
                <p className="eyebrow">GIAO DỊCH</p>
                <h2>Điểm gần đây</h2>
              </div>
            </div>
            {data.transactions.length === 0 ? (
              <EmptyState title="Chưa có giao dịch" detail="Ledger của bạn đang trống." />
            ) : (
              <div>
                {data.transactions.map((tx) => (
                  <div className="transaction-row" key={tx.id}>
                    <div>
                      <p className="m-0 text-sm font-bold">{tx.type}</p>
                      <p className="m-0 text-xs text-[var(--muted)]">
                        {tx.description ?? formatDate(tx.event_at)}
                      </p>
                    </div>
                    <strong
                      className={Number(tx.amount) >= 0 ? 'text-emerald-500' : 'text-rose-500'}
                    >
                      {Number(tx.amount) >= 0 ? '+' : ''}
                      {formatNumber(tx.amount, 2)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
