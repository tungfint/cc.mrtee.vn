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

type RankingMetric = 'CC_LEVEL' | 'CC_POINT' | 'CC_BALANCE' | 'STREAK' | 'SOLVED';
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
    ccBalance: string;
    solvedCount: number;
    streak: number;
    activityRiskLevel: 'NORMAL' | 'REVIEW' | 'PRIORITY';
    activityRiskScore: number;
    presenceStatus: 'ONLINE' | 'RECENT' | 'OFFLINE';
    levelRank: { name: string; icon: string | null; color: string | null } | null;
  }[];
  share: { scope: 'ALL' | 'ORGANIZATION'; organizationName: string | null } | null;
}

const metrics: { id: RankingMetric; label: string; icon: string }[] = [
  { id: 'CC_LEVEL', label: 'CC Level', icon: '⚡' },
  { id: 'CC_POINT', label: 'CC Point', icon: '◆' },
  { id: 'CC_BALANCE', label: 'CC Balance', icon: '◈' },
  { id: 'STREAK', label: 'Streak', icon: '🔥' },
  { id: 'SOLVED', label: 'Số bài', icon: '✓' },
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
            <strong>Cầy Cốt</strong>
            <small>MrTee.VN</small>
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
        <div className="presence-legend" aria-label="Chú thích trạng thái hoạt động">
          <span>
            <i className="presence-dot online" /> Online · dưới 60 phút
          </span>
          <span>
            <i className="presence-dot recent" /> Vừa hoạt động · 60–120 phút
          </span>
          <span>
            <i className="presence-dot offline" /> Offline · trên 120 phút
          </span>
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
              <span>CC Balance</span>
              <span>Streak</span>
              <span>Số bài</span>
            </div>
            {board.data?.entries.map((entry) => (
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
                            ? 'Online · hoạt động trong 60 phút'
                            : entry.presenceStatus === 'RECENT'
                              ? 'Vừa hoạt động · trong 60–120 phút'
                              : 'Offline · quá 120 phút'
                        }
                      />
                      <StudentName name={entry.displayName} rating={entry.currentRating} />
                      {entry.activityRiskLevel && entry.activityRiskLevel !== 'NORMAL' && (
                        <span
                          className={`activity-risk-icon ${entry.activityRiskLevel.toLowerCase()}`}
                          title="Hoạt động cần kiểm tra"
                        >
                          ⚠
                        </span>
                      )}
                      <LevelRankBadge rank={entry.levelRank} />
                    </span>
                    {entry.codeforcesHandle && (
                      <CodeforcesHandle
                        handle={entry.codeforcesHandle}
                        rating={entry.currentRating}
                      />
                    )}
                  </span>
                </Link>
                <span data-label="CC Level">⚡ {formatNumber(entry.ccLevel, 2)}</span>
                <strong data-label="CC Point">◆ {formatNumber(entry.ccPoint, 2)}</strong>
                <strong data-label="CC Balance">◈ {formatNumber(entry.ccBalance, 2)}</strong>
                <span data-label="Streak">🔥 {entry.streak} ngày</span>
                <strong data-label="Số bài">✓ {entry.solvedCount}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
