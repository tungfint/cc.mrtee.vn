import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatNumber } from '../lib/api';
import { Avatar, EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';

interface Organization {
  id: string;
  name: string;
}
interface Season {
  id: string;
  name: string;
  organization_id: string | null;
}
interface Board {
  total: number;
  page: number;
  pageSize: number;
  entries: {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    ccLevel: string;
    seasonScore: string;
    solved: number;
    streak: number;
    longestStreak: number;
  }[];
}

export default function LeaderboardPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [page, setPage] = useState(1);
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<{ organizations: Organization[] }>('/organizations'),
  });
  const seasons = useQuery({
    queryKey: ['seasons'],
    queryFn: () => api<{ seasons: Season[] }>('/seasons'),
  });
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (organizationId) params.set('organizationId', organizationId);
  if (seasonId) params.set('seasonId', seasonId);
  const board = useQuery({
    queryKey: ['leaderboard', organizationId, seasonId, page],
    queryFn: () => api<Board>(`/leaderboards?${params}`),
  });
  const filteredSeasons =
    seasons.data?.seasons.filter(
      (season) => !organizationId || season.organization_id === organizationId,
    ) ?? [];
  return (
    <>
      <PageTitle
        eyebrow="BẢNG XẾP HẠNG"
        title="Thành tích không nằm trong số dư"
        detail="Xếp hạng dựa trên CC Current; CC Point và việc đổi thưởng không làm mất thành tích đã đạt."
        action={
          <div className="filters">
            <select
              aria-label="Tổ chức"
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setSeasonId('');
                setPage(1);
              }}
              value={organizationId}
            >
              <option value="">Toàn hệ thống</option>
              {organizations.data?.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Mùa giải"
              onChange={(e) => {
                setSeasonId(e.target.value);
                setPage(1);
              }}
              value={seasonId}
            >
              <option value="">Mùa hiện tại</option>
              {filteredSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {board.isPending ? (
        <LoadingState label="Đang dựng bảng xếp hạng…" />
      ) : board.error ? (
        <ErrorState error={board.error} retry={() => void board.refetch()} />
      ) : !board.data?.entries.length ? (
        <EmptyState title="Chưa có thứ hạng" detail="Mùa giải này chưa ghi nhận điểm." />
      ) : (
        <div className="panel overflow-hidden">
          <div className="leader-table header">
            <span>Hạng</span>
            <span>Thành viên</span>
            <span>CC Level</span>
            <span>CC Current</span>
            <span>Bài giải</span>
            <span>Streak</span>
          </div>
          {board.data.entries.map((entry) => (
            <div
              className={`leader-table ${entry.rank <= 3 ? `top-${entry.rank}` : ''}`}
              key={entry.userId}
            >
              <span className="rank">
                {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
              </span>
              <span className="member">
                <Avatar name={entry.displayName} size="sm" url={entry.avatarUrl} />
                <strong>{entry.displayName}</strong>
              </span>
              <span data-label="CC Level">{formatNumber(entry.ccLevel, 2)}</span>
              <strong data-label="CC Current">{formatNumber(entry.seasonScore, 2)}</strong>
              <span data-label="Bài giải">{entry.solved}</span>
              <span data-label="Streak">🔥 {entry.streak}</span>
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
