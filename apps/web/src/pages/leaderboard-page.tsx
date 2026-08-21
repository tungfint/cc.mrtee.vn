import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LevelRankBadge,
  LoadingState,
  PageTitle,
  StudentName,
} from '../components/ui';
import { api, formatNumber } from '../lib/api';

interface Organization {
  id: string;
  name: string;
}
type RankingMetric = 'CC_LEVEL' | 'CC_POINT' | 'CC_BALANCE' | 'STREAK';
interface Board {
  total: number;
  page: number;
  pageSize: number;
  entries: {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    codeforcesHandle: string | null;
    currentRating: number | null;
    ccLevel: string;
    ccPoint: string;
    ccBalance: string;
    streak: number;
    longestStreak: number;
    activityRiskLevel: 'NORMAL' | 'REVIEW' | 'PRIORITY';
    activityRiskScore: number;
    presenceStatus: 'ONLINE' | 'RECENT' | 'OFFLINE';
    levelRank: { name: string; icon: string | null; color: string | null } | null;
  }[];
}

const metrics: { id: RankingMetric; label: string; icon: string }[] = [
  { id: 'CC_LEVEL', label: 'CC Level', icon: '⚡' },
  { id: 'CC_POINT', label: 'CC Point', icon: '◆' },
  { id: 'CC_BALANCE', label: 'CC Balance', icon: '◈' },
  { id: 'STREAK', label: 'Streak', icon: '🔥' },
];

export default function LeaderboardPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [sort, setSort] = useState<RankingMetric>('CC_LEVEL');
  const [page, setPage] = useState(1);
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<{ organizations: Organization[] }>('/organizations'),
  });
  const params = new URLSearchParams({ page: String(page), pageSize: '20', sort });
  if (organizationId) params.set('organizationId', organizationId);
  const board = useQuery({
    queryKey: ['leaderboard', organizationId, sort, page],
    queryFn: () => api<Board>(`/leaderboards?${params}`),
    refetchInterval: 15_000,
  });
  const metricLabel = metrics.find((metric) => metric.id === sort)?.label ?? 'CC Level';

  return (
    <>
      <PageTitle
        eyebrow="BẢNG XẾP HẠNG"
        title="Mỗi nỗ lực đều có vị trí"
        detail={`Đang xếp hạng theo ${metricLabel}. CC Point là tổng điểm thành tích và không giảm khi bạn đổi quà.`}
        action={
          <select
            aria-label="Lọc theo lớp"
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setPage(1);
            }}
            value={organizationId}
          >
            <option value="">Tất cả học sinh</option>
            {organizations.data?.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="ranking-toolbar" role="group" aria-label="Tiêu chí xếp hạng">
        {metrics.map((metric) => (
          <button
            className={sort === metric.id ? 'active' : ''}
            key={metric.id}
            onClick={() => {
              setSort(metric.id);
              setPage(1);
            }}
            type="button"
          >
            <span aria-hidden>{metric.icon}</span>
            {metric.label}
          </button>
        ))}
      </div>
      <div className="presence-legend" aria-label="Chú thích trạng thái hoạt động">
        <span>
          <i className="presence-dot online" /> Online · dưới 10 phút
        </span>
        <span>
          <i className="presence-dot recent" /> Vừa hoạt động · 10–30 phút
        </span>
        <span>
          <i className="presence-dot offline" /> Offline · trên 30 phút
        </span>
      </div>

      {board.isPending ? (
        <LoadingState label="Đang dựng bảng xếp hạng…" />
      ) : board.error ? (
        <ErrorState error={board.error} retry={() => void board.refetch()} />
      ) : !board.data?.entries.length ? (
        <EmptyState title="Chưa có thứ hạng" detail="Chưa có dữ liệu học sinh để xếp hạng." />
      ) : (
        <div className="panel overflow-hidden">
          <div className="leader-table leader-table-compact header">
            <span>Hạng</span>
            <span>Học sinh</span>
            <span>CC Level</span>
            <span>CC Point</span>
            <span>CC Balance</span>
            <span>Streak</span>
          </div>
          {board.data.entries.map((entry) => (
            <div
              className={`leader-table leader-table-compact ${entry.rank <= 3 ? `top-${entry.rank}` : ''}`}
              key={entry.userId}
            >
              <span className="rank">
                {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
              </span>
              <Link className="member student-profile-link" to={`/students/${entry.userId}`}>
                <Avatar
                  name={entry.displayName}
                  rating={entry.currentRating}
                  size="sm"
                  url={entry.avatarUrl}
                />
                <span className="leader-identity-copy">
                  <span className="leader-name-row">
                    <span
                      aria-label={
                        entry.presenceStatus === 'ONLINE'
                          ? 'Đang online'
                          : entry.presenceStatus === 'RECENT'
                            ? 'Vừa hoạt động'
                            : 'Đang offline'
                      }
                      className={`presence-dot ${entry.presenceStatus.toLowerCase()}`}
                      title={
                        entry.presenceStatus === 'ONLINE'
                          ? 'Online · hoạt động trong 10 phút'
                          : entry.presenceStatus === 'RECENT'
                            ? 'Vừa hoạt động · trong 10–30 phút'
                            : 'Offline · quá 30 phút'
                      }
                    />
                    <StudentName name={entry.displayName} rating={entry.currentRating} />
                    {entry.activityRiskLevel && entry.activityRiskLevel !== 'NORMAL' && (
                      <span
                        className={`activity-risk-icon ${entry.activityRiskLevel.toLowerCase()}`}
                        title={
                          entry.activityRiskLevel === 'PRIORITY'
                            ? 'Hoạt động được ưu tiên kiểm tra'
                            : 'Hoạt động cần kiểm tra'
                        }
                      >
                        ⚠
                      </span>
                    )}
                    <LevelRankBadge rank={entry.levelRank} />
                  </span>
                  {entry.codeforcesHandle ? (
                    <CodeforcesHandle
                      handle={entry.codeforcesHandle}
                      rating={entry.currentRating}
                    />
                  ) : (
                    <small>Chưa liên kết Codeforces</small>
                  )}
                </span>
              </Link>
              <span data-label="CC Level">⚡ {formatNumber(entry.ccLevel, 2)}</span>
              <strong data-label="CC Point">◆ {formatNumber(entry.ccPoint, 2)}</strong>
              <strong data-label="CC Balance">◈ {formatNumber(entry.ccBalance, 2)}</strong>
              <span data-label="Streak">🔥 {entry.streak} ngày</span>
            </div>
          ))}
        </div>
      )}
      {board.data && board.data.total > board.data.pageSize && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            className="button-secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            ← Trước
          </button>
          <span className="text-sm text-[var(--muted)]">Trang {page}</span>
          <button
            className="button-secondary"
            disabled={page * board.data.pageSize >= board.data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Sau →
          </button>
        </div>
      )}
    </>
  );
}
