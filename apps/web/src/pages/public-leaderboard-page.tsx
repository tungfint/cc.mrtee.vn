import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  CodeforcesHandle,
  ErrorState,
  LevelRankBadge,
  LoadingState,
  StudentName,
} from '../components/ui';
import { api, formatNumber } from '../lib/api';

type RankingMetric = 'CC_LEVEL' | 'CC_POINT' | 'STREAK';
interface SharedBoard {
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
  share: { scope: 'ALL' | 'ORGANIZATION'; organizationName: string | null } | null;
}

const metrics: { id: RankingMetric; label: string; icon: string }[] = [
  { id: 'CC_LEVEL', label: 'CC Level', icon: '⚡' },
  { id: 'CC_POINT', label: 'CC Point', icon: '◆' },
  { id: 'STREAK', label: 'Streak', icon: '🔥' },
];

export default function PublicLeaderboardPage() {
  const { shareKey = '' } = useParams();
  const [sort, setSort] = useState<RankingMetric>('CC_LEVEL');
  const board = useQuery({
    queryKey: ['public-leaderboard', shareKey, sort],
    queryFn: () =>
      api<SharedBoard>(
        `/leaderboards?shareKey=${encodeURIComponent(shareKey)}&sort=${sort}&pageSize=50`,
      ),
    retry: false,
  });
  const title = board.data?.share?.organizationName
    ? `Bảng xếp hạng lớp ${board.data.share.organizationName}`
    : 'Bảng xếp hạng toàn hệ thống';

  return (
    <main className="public-leaderboard-page">
      <header className="public-leaderboard-header">
        <Link className="brand" to="/login">
          <img alt="" className="brand-logo" src="/brand/cay-code-logo.webp" />
          <span>
            <strong>Cầy Code</strong>
            <small>MrTee.vn</small>
          </span>
        </Link>
        <Link className="button-secondary" to="/login">
          Đăng nhập
        </Link>
      </header>
      <section className="public-leaderboard-content">
        <div className="public-leaderboard-hero">
          <p className="eyebrow">BẢNG XẾP HẠNG CÔNG KHAI</p>
          <h1>{title}</h1>
          <p>Xem thành tích học sinh mà không cần đăng nhập.</p>
        </div>
        <div className="ranking-toolbar" role="group" aria-label="Tiêu chí xếp hạng">
          {metrics.map((metric) => (
            <button
              className={sort === metric.id ? 'active' : ''}
              key={metric.id}
              onClick={() => setSort(metric.id)}
              type="button"
            >
              <span aria-hidden>{metric.icon}</span>
              {metric.label}
            </button>
          ))}
        </div>
        {board.isPending ? (
          <LoadingState label="Đang tải bảng xếp hạng…" />
        ) : board.error ? (
          <ErrorState error={board.error} retry={() => void board.refetch()} />
        ) : (
          <div className="panel overflow-hidden">
            <div className="leader-table leader-table-compact header">
              <span>Hạng</span>
              <span>Học sinh</span>
              <span>CC Level</span>
              <span>CC Point</span>
              <span>Streak</span>
            </div>
            {board.data?.entries.map((entry) => (
              <div
                className={`leader-table leader-table-compact ${entry.rank <= 3 ? `top-${entry.rank}` : ''}`}
                key={entry.userId}
              >
                <span className="rank">
                  {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                </span>
                <span className="member">
                  <Avatar
                    name={entry.displayName}
                    rating={entry.currentRating}
                    size="sm"
                    url={entry.avatarUrl}
                  />
                  <span className="leader-identity-copy">
                    <span className="leader-name-row">
                      <StudentName name={entry.displayName} rating={entry.currentRating} />
                      <LevelRankBadge rank={entry.levelRank} />
                    </span>
                    {entry.codeforcesHandle && (
                      <CodeforcesHandle
                        handle={entry.codeforcesHandle}
                        rating={entry.currentRating}
                      />
                    )}
                  </span>
                </span>
                <span data-label="CC Level">⚡ {formatNumber(entry.ccLevel, 2)}</span>
                <strong data-label="CC Point">◆ {formatNumber(entry.ccPoint, 2)}</strong>
                <span data-label="Streak">🔥 {entry.streak} ngày</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
