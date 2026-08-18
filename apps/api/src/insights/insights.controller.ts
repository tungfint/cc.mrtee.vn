import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { currentDateStreak, longestDateStreak } from '@cc/core';
import { z } from 'zod';
import { CurrentUser, OptionalAuth, OptionalUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  current_rating: number | null;
  cc_level: string;
  season_score: string;
  qualifying_solves: number;
  final_rank: number | null;
  timezone: string;
  today_key: string;
  date_keys: string[] | null;
}

const leaderboardQuery = z.object({
  organizationId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller()
export class InsightsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get('me/dashboard')
  async dashboard(@CurrentUser() user: AuthUser) {
    const [profile, seasons, streak, tags, activity, transactions, awards, fulfilledRewards] =
      await Promise.all([
        this.database.sql`
        SELECT users.id, users.display_name, users.full_name, users.avatar_url, users.timezone,
          accounts.handle AS codeforces_handle, accounts.verification_status,
          accounts.pending_handle, accounts.current_rating, accounts.rank AS codeforces_rank,
          accounts.sync_status, accounts.last_sync_at, accounts.next_sync_at,
          COALESCE(skill.cc_level, 800)::text AS cc_level,
          COALESCE(wallet.balance, 0)::text AS wallet_balance,
          (SELECT count(*)::int FROM user_problem_solves WHERE user_id = users.id) AS total_solves
        FROM users
        LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
        LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
        LEFT JOIN user_wallets AS wallet ON wallet.user_id = users.id
        WHERE users.id = ${user.userId}
      `,
        this.database.sql`
        SELECT seasons.id, seasons.name, seasons.organization_id, seasons.status,
          seasons.start_at, seasons.end_at,
          COALESCE(totals.score, 0)::text AS score,
          COALESCE(totals.qualifying_solves, 0)::int AS qualifying_solves
        FROM seasons
        LEFT JOIN season_user_totals AS totals
          ON totals.season_id = seasons.id AND totals.user_id = ${user.userId}
        WHERE seasons.status IN ('ACTIVE', 'CLOSING')
          AND seasons.start_at <= now() AND seasons.end_at > now()
          AND (
            seasons.organization_id IS NULL OR EXISTS (
              SELECT 1 FROM organization_memberships
              WHERE organization_id = seasons.organization_id
                AND user_id = ${user.userId} AND status = 'ACTIVE'
            )
          )
        ORDER BY (seasons.organization_id IS NOT NULL) DESC, seasons.start_at DESC
        LIMIT 1
      `,
        this.streak(user.userId),
        this.database.sql`
        SELECT tag, count(DISTINCT solves.problem_key)::int AS solved_count,
          round(avg(solves.rating_snapshot), 2)::text AS average_rating,
          max(solves.rating_snapshot)::int AS max_rating
        FROM user_problem_solves AS solves
        JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
        CROSS JOIN LATERAL unnest(problems.tags) AS tag
        WHERE solves.user_id = ${user.userId}
        GROUP BY tag ORDER BY solved_count DESC, tag LIMIT 20
      `,
        this.database.sql`
        SELECT solves.problem_key, problems.name, solves.rating_snapshot,
          solves.first_solved_at, problems.tags
        FROM user_problem_solves AS solves
        JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
        WHERE solves.user_id = ${user.userId}
        ORDER BY solves.first_solved_at DESC LIMIT 10
      `,
        this.database.sql`
        SELECT id, type, amount::text, description, event_at, created_at
        FROM point_transactions WHERE user_id = ${user.userId}
        ORDER BY created_at DESC LIMIT 10
      `,
        this.database.sql`
        SELECT awards.award_type, awards.title, awards.awarded_at, seasons.name AS season_name
        FROM season_awards AS awards
        JOIN seasons ON seasons.id = awards.season_id
        WHERE awards.user_id = ${user.userId}
        ORDER BY awards.awarded_at DESC LIMIT 8
      `,
        this.database.sql`
        SELECT rewards.name, rewards.description, rewards.image_url, orders.reviewed_at AS earned_at
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        WHERE orders.user_id = ${user.userId} AND orders.status = 'FULFILLED'
        ORDER BY orders.reviewed_at DESC NULLS LAST LIMIT 8
      `,
      ]);
    return {
      profile: profile[0] ?? null,
      season: seasons[0] ?? null,
      streak: streak ?? { current_streak: 0, longest_streak: 0 },
      tags,
      activity,
      transactions,
      awards,
      fulfilledRewards,
    };
  }

  @OptionalAuth()
  @Get('leaderboards')
  async leaderboard(@Query() raw: unknown, @OptionalUser() user?: AuthUser) {
    const parsed = leaderboardQuery.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Bộ lọc bảng xếp hạng không hợp lệ');
    const input = parsed.data;
    let organizationId = input.organizationId ?? null;
    let seasonId = input.seasonId ?? null;
    if (seasonId) {
      const [season] = await this.database.sql<{ organization_id: string | null }[]>`
        SELECT organization_id FROM seasons WHERE id = ${seasonId}
      `;
      if (!season) throw new BadRequestException('Không tìm thấy mùa giải');
      if (organizationId && season.organization_id !== organizationId) {
        throw new BadRequestException('Mùa giải không thuộc tổ chức đã chọn');
      }
      organizationId = season.organization_id;
    }
    if (organizationId) {
      const access = await this.authorization.organizationAccess(organizationId, user);
      this.authorization.assertCanView(access, user);
    }
    if (!seasonId) {
      const [active] = await this.database.sql<{ id: string }[]>`
        SELECT id FROM seasons
        WHERE organization_id IS NOT DISTINCT FROM ${organizationId}
          AND status IN ('ACTIVE', 'CLOSING')
          AND start_at <= now() AND end_at > now()
        ORDER BY start_at DESC LIMIT 1
      `;
      seasonId = active?.id ?? null;
    }
    const offset = (input.page - 1) * input.pageSize;
    const rows = await this.database.sql<LeaderboardRow[]>`
      SELECT users.id AS user_id, users.display_name, users.avatar_url, users.timezone,
        accounts.current_rating,
        COALESCE(skill.cc_level, 800)::text AS cc_level,
        COALESCE(totals.score, 0)::text AS season_score,
        COALESCE(totals.qualifying_solves, 0)::int AS qualifying_solves,
        snapshots.final_rank,
        to_char(now() AT TIME ZONE users.timezone, 'YYYY-MM-DD') AS today_key,
        streak.date_keys
      FROM users
      ${organizationId ? this.database.sql`JOIN organization_memberships AS memberships ON memberships.user_id = users.id AND memberships.organization_id = ${organizationId} AND memberships.status = 'ACTIVE'` : this.database.sql``}
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      LEFT JOIN season_user_totals AS totals
        ON totals.user_id = users.id AND totals.season_id IS NOT DISTINCT FROM ${seasonId}
      LEFT JOIN season_user_snapshots AS snapshots
        ON snapshots.user_id = users.id AND snapshots.season_id IS NOT DISTINCT FROM ${seasonId}
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT to_char(
          first_solved_at AT TIME ZONE users.timezone, 'YYYY-MM-DD'
        )) AS date_keys
        FROM user_problem_solves WHERE user_id = users.id
      ) AS streak ON true
      WHERE users.status = 'ACTIVE'
      ORDER BY COALESCE(snapshots.final_rank, 2147483647), COALESCE(totals.score, 0) DESC,
        COALESCE(totals.qualifying_solves, 0) DESC, COALESCE(skill.cc_level, 800) DESC,
        totals.reached_score_at, users.id
      LIMIT ${input.pageSize} OFFSET ${offset}
    `;
    const [{ count } = { count: '0' }] = await this.database.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM users
      ${organizationId ? this.database.sql`JOIN organization_memberships AS memberships ON memberships.user_id = users.id AND memberships.organization_id = ${organizationId} AND memberships.status = 'ACTIVE'` : this.database.sql``}
      WHERE users.status = 'ACTIVE'
    `;
    return {
      seasonId,
      organizationId,
      page: input.page,
      pageSize: input.pageSize,
      total: Number(count),
      entries: rows.map((row, index) => ({
        rank: row.final_rank ?? offset + index + 1,
        userId: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        currentRating: row.current_rating,
        ccLevel: row.cc_level,
        seasonScore: row.season_score,
        solved: row.qualifying_solves,
        streak: currentDateStreak(row.date_keys ?? [], row.today_key),
        longestStreak: longestDateStreak(row.date_keys ?? []),
      })),
    };
  }

  @OptionalAuth()
  @Get('seasons')
  async seasons(@OptionalUser() user?: AuthUser) {
    return {
      seasons: await this.database.sql`
        SELECT DISTINCT seasons.id, seasons.organization_id, seasons.name, seasons.status,
          seasons.start_at, seasons.end_at, organizations.name AS organization_name
        FROM seasons
        LEFT JOIN organizations ON organizations.id = seasons.organization_id
        LEFT JOIN organization_memberships AS memberships
          ON memberships.organization_id = seasons.organization_id
          AND memberships.user_id = ${user?.userId ?? null} AND memberships.status = 'ACTIVE'
        WHERE seasons.status <> 'DRAFT' AND (
          seasons.organization_id IS NULL OR organizations.visibility = 'PUBLIC'
          OR (${Boolean(user)} AND organizations.visibility = 'CLOSED')
          OR memberships.id IS NOT NULL OR ${user?.systemRole === 'SYSTEM_ADMIN'}
        )
        ORDER BY seasons.start_at DESC
      `,
    };
  }

  @OptionalAuth()
  @Get('organizations')
  async organizations(@OptionalUser() user?: AuthUser) {
    return {
      organizations: await this.database.sql`
        SELECT DISTINCT organizations.id, organizations.name, organizations.slug,
          organizations.visibility, organizations.timezone
        FROM organizations
        LEFT JOIN organization_memberships AS memberships
          ON memberships.organization_id = organizations.id
          AND memberships.user_id = ${user?.userId ?? null} AND memberships.status = 'ACTIVE'
        WHERE organizations.status = 'ACTIVE' AND (
          organizations.visibility = 'PUBLIC'
          OR (${Boolean(user)} AND organizations.visibility = 'CLOSED')
          OR memberships.id IS NOT NULL OR ${user?.systemRole === 'SYSTEM_ADMIN'}
        ) ORDER BY organizations.name
      `,
    };
  }

  private async streak(userId: string) {
    const [result] = await this.database.sql`
      WITH days AS (
        SELECT DISTINCT (solves.first_solved_at AT TIME ZONE users.timezone)::date AS day,
          (now() AT TIME ZONE users.timezone)::date AS today
        FROM user_problem_solves AS solves
        JOIN users ON users.id = solves.user_id
        WHERE solves.user_id = ${userId}
      ), grouped AS (
        SELECT day, today, day - row_number() OVER (ORDER BY day)::int AS island FROM days
      ), streaks AS (
        SELECT count(*)::int AS length, max(day) AS end_day, max(today) AS today
        FROM grouped GROUP BY island
      )
      SELECT COALESCE(max(length), 0)::int AS longest_streak,
        COALESCE(max(length) FILTER (WHERE end_day IN (today, today - 1)), 0)::int AS current_streak
      FROM streaks
    `;
    return result;
  }
}
