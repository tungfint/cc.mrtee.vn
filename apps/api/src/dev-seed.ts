import { calculateCcLevel, calculateReward, CF_SYNC_QUEUE, round2 } from '@cc/core';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import postgres from 'postgres';
import { hashPassword } from './auth/password';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The simulation seed is DEV ONLY and cannot run in production');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const password = process.env.DEV_SEED_PASSWORD ?? 'DemoChangeMe!2026';
const sql = postgres(databaseUrl, { max: 1 });
const dayMs = 86_400_000;
const now = new Date();
const activeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const activeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

const ids = {
  organization: '10000000-0000-4000-8000-000000000001',
  activeSeason: '20000000-0000-4000-8000-000000000001',
  previousSeason: '20000000-0000-4000-8000-000000000002',
  admin: '30000000-0000-4000-8000-000000000001',
};

interface Profile {
  id: string;
  key: string;
  name: string;
  email: string;
  base: number;
  ratings: number[];
  days: number;
}

function ramp(count: number, from: number, to: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => Math.round((from + ((to - from) * index) / Math.max(1, count - 1)) / 100) * 100,
  );
}

function codeforcesRank(rating: number): string {
  if (rating >= 3000) return 'legendary grandmaster';
  if (rating >= 2600) return 'international grandmaster';
  if (rating >= 2400) return 'grandmaster';
  if (rating >= 2300) return 'international master';
  if (rating >= 2100) return 'master';
  if (rating >= 1900) return 'candidate master';
  if (rating >= 1600) return 'expert';
  if (rating >= 1400) return 'specialist';
  if (rating >= 1200) return 'pupil';
  return 'newbie';
}

const profiles: Profile[] = [
  {
    id: '30000000-0000-4000-8000-000000000011',
    key: 'beginner',
    name: 'An Beginner',
    email: 'beginner@demo.local',
    base: 800,
    ratings: ramp(42, 800, 1300),
    days: 12,
  },
  {
    id: '30000000-0000-4000-8000-000000000012',
    key: 'strong',
    name: 'Bình Strong',
    email: 'strong@demo.local',
    base: 1500,
    ratings: ramp(44, 1500, 1900),
    days: 12,
  },
  {
    id: '30000000-0000-4000-8000-000000000013',
    key: 'shock_high',
    name: 'Chi Shock-high',
    email: 'shock-high@demo.local',
    base: 800,
    ratings: [...ramp(5, 1500, 1700), ...ramp(26, 1400, 1600)],
    days: 9,
  },
  {
    id: '30000000-0000-4000-8000-000000000014',
    key: 'shock_easy',
    name: 'Dũng Shock-then-easy',
    email: 'shock-easy@demo.local',
    base: 800,
    ratings: [1500, 1500, ...ramp(45, 800, 1000)],
    days: 8,
  },
  {
    id: '30000000-0000-4000-8000-000000000015',
    key: 'easy_farmer',
    name: 'Em Easy farmer',
    email: 'easy-farmer@demo.local',
    base: 800,
    ratings: ramp(60, 800, 1000),
    days: 7,
  },
  {
    id: '30000000-0000-4000-8000-000000000016',
    key: 'consistent',
    name: 'Giang Consistent',
    email: 'consistent@demo.local',
    base: 1000,
    ratings: ramp(35, 1000, 1450),
    days: 14,
  },
  {
    id: '30000000-0000-4000-8000-000000000017',
    key: 'challenge',
    name: 'Hà Challenge',
    email: 'challenge@demo.local',
    base: 1000,
    ratings: ramp(10, 1700, 2100),
    days: 5,
  },
];

async function main(): Promise<void> {
  const passwordHash = await hashPassword(password);
  const expected: Array<{
    profile: Profile;
    level: number;
    calculated: number;
    score: number;
    activeDays: number;
  }> = [];

  try {
    await sql.begin(async (transaction) => {
      await transaction`
      INSERT INTO users (id, full_name, display_name, avatar_url, system_role)
      VALUES (${ids.admin}, 'Quản trị viên Demo', 'Admin Demo',
        'https://api.dicebear.com/9.x/initials/svg?seed=Admin%20Demo', 'SYSTEM_ADMIN')
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        system_role = EXCLUDED.system_role,
        updated_at = now()
    `;
      await transaction`
      INSERT INTO user_credentials (user_id, email, password_hash)
      VALUES (${ids.admin}, 'admin@demo.local', ${passwordHash})
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    `;
      await transaction`
      INSERT INTO organizations (id, name, slug, visibility)
      VALUES (${ids.organization}, 'Lớp Cầy Code Demo', 'cay-code-demo', 'PUBLIC')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug,
        visibility = EXCLUDED.visibility
    `;
      await transaction`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${ids.organization}, ${ids.admin}, 'ORG_ADMIN')
      ON CONFLICT (organization_id, user_id) WHERE status = 'ACTIVE'
      DO UPDATE SET role = EXCLUDED.role, updated_at = now()
    `;
      await transaction`
      INSERT INTO seasons (id, organization_id, name, start_at, end_at, status, scoring_policy_version)
      VALUES
        (${ids.activeSeason}, ${ids.organization}, 'CC Current', ${activeStart}, ${activeEnd}, 'ACTIVE', 'v2.0'),
        (${ids.previousSeason}, ${ids.organization}, 'CC Previous', ${previousStart}, ${activeStart}, 'CLOSED', 'v2.0')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        status = EXCLUDED.status,
        updated_at = now()
    `;

      for (const [profileIndex, profile] of profiles.entries()) {
        const currentRating = profile.ratings.at(-1) ?? profile.base;
        await transaction`
        INSERT INTO users (id, full_name, display_name, avatar_url)
        VALUES (${profile.id}, ${`${profile.name} — simulation`}, ${profile.name},
          ${`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(profile.name)}`})
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          display_name = EXCLUDED.display_name,
          avatar_url = EXCLUDED.avatar_url,
          updated_at = now()
      `;
        await transaction`
        INSERT INTO user_credentials (user_id, email, password_hash)
        VALUES (${profile.id}, ${profile.email}, ${passwordHash})
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = now()
      `;
        await transaction`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${ids.organization}, ${profile.id}, 'MEMBER')
        ON CONFLICT (organization_id, user_id) WHERE status = 'ACTIVE' DO NOTHING
      `;
        await transaction`
        INSERT INTO codeforces_accounts (
          user_id, handle, verification_status, verified_at, verified_by,
          reward_eligible_from, backfill_completed_at, sync_status, last_sync_at, next_sync_at,
          current_rating, max_rating, rank, max_rank
        ) VALUES (
          ${profile.id}, ${`demo_${profile.key}`}, 'ADMIN_VERIFIED', ${activeStart}, ${ids.admin},
          ${activeStart}, ${activeStart}, 'READY', ${now}, '2099-01-01T00:00:00Z',
          ${currentRating}, ${Math.max(...profile.ratings)}, ${codeforcesRank(currentRating)},
          ${codeforcesRank(Math.max(...profile.ratings))}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          verification_status = 'ADMIN_VERIFIED',
          verified_at = EXCLUDED.verified_at,
          verified_by = EXCLUDED.verified_by,
          reward_eligible_from = EXCLUDED.reward_eligible_from,
          sync_status = 'READY',
          current_rating = EXCLUDED.current_rating,
          max_rating = EXCLUDED.max_rating,
          rank = EXCLUDED.rank,
          max_rank = EXCLUDED.max_rank,
          last_sync_error = NULL,
          next_sync_at = EXCLUDED.next_sync_at,
          updated_at = now()
      `;

        const priorSolves: Array<{ problemKey: string; rating: number }> = [];
        let seasonScore = 0;
        const activityDays = new Set<string>();
        for (const [solveIndex, rating] of profile.ratings.entries()) {
          const contestId = 9_100_000 + profileIndex * 1_000 + solveIndex;
          const submissionId = 9_900_000_000 + profileIndex * 1_000 + solveIndex;
          const problemKey = `contest:${contestId}:A`;
          const dayOffset = Math.floor(
            ((profile.ratings.length - 1 - solveIndex) * profile.days) /
              Math.max(1, profile.ratings.length - 1),
          );
          const solvedAt = new Date(now.getTime() - dayOffset * dayMs);
          const dateKey = solvedAt.toISOString().slice(0, 10);
          activityDays.add(dateKey);
          const before = calculateCcLevel(priorSolves, {
            decay: 0.95,
            denominator: 20,
            base: profile.base,
          }).level;
          const reward = calculateReward(rating, before, {
            min: 0.05,
            max: 30,
            midpointDelta: 50,
            scale: 80,
          });
          const tags = solveIndex % 3 === 0 ? ['dp', 'greedy'] : ['implementation'];
          await transaction`
          INSERT INTO cf_problems (
            problem_key, contest_id, problem_index, name, type, current_rating, tags
          ) VALUES (
            ${problemKey}, ${contestId}, 'A', ${`Demo ${profile.key} #${solveIndex + 1}`},
            'PROGRAMMING', ${rating}, ${tags}
          ) ON CONFLICT (problem_key) DO NOTHING
        `;
          await transaction`
          INSERT INTO cf_submissions (
            cf_submission_id, user_id, problem_key, creation_time, verdict,
            participant_type, is_team, programming_language, problem_rating_observed
          ) VALUES (
            ${submissionId}, ${profile.id}, ${problemKey}, ${solvedAt}, 'OK',
            'PRACTICE', false, 'GNU C++20 (64)', ${rating}
          ) ON CONFLICT (cf_submission_id) DO NOTHING
        `;
          await transaction`
          INSERT INTO user_problem_solves (
            user_id, problem_key, first_ok_submission_id, first_solved_at,
            rating_snapshot, reward_eligible
          ) VALUES (${profile.id}, ${problemKey}, ${submissionId}, ${solvedAt}, ${rating}, true)
          ON CONFLICT (user_id, problem_key) DO NOTHING
        `;
          await transaction`
          INSERT INTO point_transactions (
            user_id, type, amount, season_id, source_submission_id, idempotency_key,
            affects_wallet, affects_season, cc_level_before, problem_rating_snapshot,
            scoring_policy_version, description, event_at
          ) VALUES (
            ${profile.id}, 'EARN', ${reward}, ${ids.activeSeason}, ${submissionId},
            ${`dev-seed:earn:${submissionId}`}, true, true, ${before}, ${rating}, 'v2.0',
            'Điểm mô phỏng DEV', ${solvedAt}
          ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        `;
          seasonScore = round2(seasonScore + reward);
          priorSolves.push({ problemKey, rating });
        }

        const level = calculateCcLevel(priorSolves, {
          decay: 0.95,
          denominator: 20,
          base: profile.base,
        });
        await transaction`
        INSERT INTO user_skill_state (
          user_id, cc_base, cc_calculated, cc_level, scoring_policy_version
        ) VALUES (${profile.id}, ${profile.base}, ${level.calculated}, ${level.level}, 'v2.0')
        ON CONFLICT (user_id) DO UPDATE SET
          cc_base = EXCLUDED.cc_base,
          cc_calculated = EXCLUDED.cc_calculated,
          cc_level = EXCLUDED.cc_level,
          updated_at = now()
      `;
        await transaction`
        INSERT INTO season_user_totals (
          season_id, user_id, earned, score, qualifying_solves, reached_score_at
        ) VALUES (
          ${ids.activeSeason}, ${profile.id}, ${seasonScore}, ${seasonScore},
          ${profile.ratings.length}, ${now}
        ) ON CONFLICT (season_id, user_id) DO UPDATE SET
          earned = EXCLUDED.earned,
          score = EXCLUDED.score,
          qualifying_solves = EXCLUDED.qualifying_solves,
          reached_score_at = EXCLUDED.reached_score_at,
          updated_at = now()
      `;
        await transaction`
        INSERT INTO user_wallets (user_id, balance)
        SELECT ${profile.id}, COALESCE(sum(amount) FILTER (WHERE affects_wallet), 0)
        FROM point_transactions WHERE user_id = ${profile.id}
        ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now()
      `;
        expected.push({
          profile,
          level: level.level,
          calculated: level.calculated,
          score: seasonScore,
          activeDays: activityDays.size,
        });
      }

      const ranked = [...expected].sort((a, b) => b.score - a.score);
      for (const [rankIndex, result] of ranked.entries()) {
        await transaction`
        INSERT INTO season_user_snapshots (
          season_id, user_id, cc_level_start, cc_level_end, cc_level_growth,
          season_score, qualifying_solves, active_days, longest_streak,
          max_challenge_delta, final_rank, closed_at
        ) VALUES (
          ${ids.previousSeason}, ${result.profile.id}, ${result.profile.base}, ${result.level},
          ${round2(result.level - result.profile.base)}, ${result.score},
          ${result.profile.ratings.length}, ${result.activeDays}, ${result.activeDays},
          ${Math.max(...result.profile.ratings) - result.profile.base}, ${rankIndex + 1}, ${activeStart}
        ) ON CONFLICT (season_id, user_id) DO NOTHING
      `;
      }

      const awards = [
        { userId: ranked[0]?.profile.id, type: 'TOP_SCORE', title: 'Top điểm mùa' },
        {
          userId: profiles.find((item) => item.key === 'consistent')?.id,
          type: 'MOST_CONSISTENT',
          title: 'Bền bỉ nhất',
        },
        {
          userId: profiles.find((item) => item.key === 'challenge')?.id,
          type: 'CHALLENGE',
          title: 'Chinh phục thử thách',
        },
      ];
      for (const award of awards) {
        if (!award.userId) continue;
        await transaction`
        INSERT INTO season_awards (season_id, user_id, award_type, title, awarded_by)
        VALUES (${ids.previousSeason}, ${award.userId}, ${award.type}, ${award.title}, ${ids.admin})
        ON CONFLICT (season_id, user_id, award_type, title) DO NOTHING
      `;
      }

      await transaction`
      INSERT INTO rewards (id, name, description, cost, stock, active)
      VALUES
        ('40000000-0000-4000-8000-000000000001', 'Huy hiệu Cầy Code', 'Huy hiệu thành tích giới hạn', 40, 25, true),
        ('40000000-0000-4000-8000-000000000002', 'Mentoring 30 phút', 'Phiên trao đổi riêng với giáo viên', 120, 10, true),
        ('40000000-0000-4000-8000-000000000003', 'Áo MrTee.vn', 'Áo lưu niệm của câu lạc bộ', 250, 5, true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        cost = EXCLUDED.cost,
        stock = EXCLUDED.stock,
        active = true,
        updated_at = now()
    `;
    });

    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
      const queue = new Queue(CF_SYNC_QUEUE, { connection: redis });
      try {
        for (const profile of profiles) {
          const job = await queue.getJob(`sync-${profile.id}`);
          if (!job) continue;
          try {
            await job.remove();
          } catch {
            console.warn(`Could not remove active demo sync job for ${profile.key}`);
          }
        }
      } finally {
        await queue.close();
        await redis.quit();
      }
    }

    console.table(
      expected.map(({ profile, level, calculated, score, activeDays }) => ({
        scenario: profile.key,
        email: profile.email,
        base: profile.base,
        solves: profile.ratings.length,
        activeDays,
        ccCalculated: calculated,
        ccLevel: level,
        seasonScore: score,
      })),
    );
    console.log(`Admin: admin@demo.local / ${password}`);
    console.log(`Student password: ${password}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
