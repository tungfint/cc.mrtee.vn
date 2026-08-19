import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
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
import { api, formatDate, formatNumber, formatVnd } from '../lib/api';

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
    cc_base: string;
    cc_level: string;
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
  streak: { current_streak: number; longest_streak: number };
  awards: { award_type: string; title: string; season_name: string; awarded_at: string }[];
  rewards: {
    name: string;
    description: string;
    cash_value_vnd: number | null;
    earned_at: string;
  }[];
  topTags: { tag: string; solved_count: number; max_rating: number | null }[];
}

export default function StudentProfilePage() {
  const { userId = '' } = useParams();
  const student = useQuery({
    queryKey: ['student-profile', userId],
    queryFn: () => api<StudentProfile>(`/students/${userId}/profile`),
    enabled: Boolean(userId),
    refetchInterval: 15_000,
  });
  if (student.isPending) return <LoadingState label="Đang tải hồ sơ học sinh…" fullPage />;
  if (student.error)
    return <ErrorState error={student.error} retry={() => void student.refetch()} />;
  if (!student.data)
    return <EmptyState title="Không tìm thấy học sinh" detail="Hồ sơ không còn khả dụng." />;
  const { profile, streak, awards, rewards, topTags } = student.data;
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
            <strong>Cầy Code</strong>
            <small>MrTee.vn</small>
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
            </div>
            <small>{profile.classes.length ? profile.classes.join(' · ') : 'Chưa xếp lớp'}</small>
          </div>
        </div>

        <section className="student-profile-metrics">
          <ProfileMetric
            icon="⚡"
            label="CC Level"
            value={formatNumber(profile.cc_level, 2)}
            note={`CC Base ${formatNumber(profile.cc_base)}`}
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
              {awards.map((award) => (
                <article key={`${award.award_type}-${award.awarded_at}`}>
                  <span>🏆</span>
                  <div>
                    <strong>{award.title}</strong>
                    <p>
                      {award.season_name} · {formatDate(award.awarded_at)}
                    </p>
                  </div>
                </article>
              ))}
              {rewards.map((reward) => (
                <article key={`${reward.name}-${reward.earned_at}`}>
                  <span>{reward.cash_value_vnd ? '💵' : '🎁'}</span>
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
              ))}
              {!awards.length && !rewards.length && (
                <p className="text-sm text-[var(--muted)]">
                  Những cột mốc mới sẽ xuất hiện tại đây.
                </p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
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
