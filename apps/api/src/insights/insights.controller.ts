import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  CurrentUser,
  OptionalAuth,
  OptionalUser,
  RequireSystemRole,
} from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { StreakService } from '../rewards/streak.service';
import { RecognitionImageService } from './recognition-image.service';

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  codeforces_handle: string | null;
  current_rating: number | null;
  cc_level: string;
  cc_point: string;
  cc_balance: string;
  current_streak: number;
  longest_streak: number;
  level_rank_name: string | null;
  level_rank_icon: string | null;
  level_rank_color: string | null;
}

const leaderboardQuery = z.object({
  organizationId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  sort: z.enum(['CC_LEVEL', 'CC_POINT', 'CC_BALANCE', 'STREAK']).default('CC_LEVEL'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  shareKey: z.string().trim().min(20).max(180).optional(),
});

@Controller()
export class InsightsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly streaks: StreakService,
    private readonly recognitionImages: RecognitionImageService,
  ) {}

  @Post('recognition-images')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
      },
    }),
  )
  async uploadRecognitionImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Chọn ảnh PNG, JPG hoặc WebP tối đa 10 MB');
    return { imageUrl: await this.recognitionImages.store(user.userId, file.buffer) };
  }

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
          COALESCE(points.cc_point, 0)::text AS cc_point,
          (SELECT count(*)::int FROM user_problem_solves WHERE user_id = users.id) AS total_solves,
          (SELECT max(rating_snapshot)::int FROM user_problem_solves WHERE user_id = users.id)
            AS highest_problem_rating,
          (SELECT round(avg(recent.rating_snapshot))::int FROM (
            SELECT rating_snapshot FROM user_problem_solves
            WHERE user_id = users.id AND rating_snapshot IS NOT NULL
            ORDER BY first_solved_at DESC LIMIT 5
          ) AS recent) AS recent_five_average_rating,
          (SELECT count(*)::int FROM (
            SELECT 1 FROM user_problem_solves
            WHERE user_id = users.id AND rating_snapshot IS NOT NULL
            ORDER BY first_solved_at DESC LIMIT 5
          ) AS recent) AS recent_five_rated_count,
          (SELECT problems.name FROM user_problem_solves AS solves
            JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
            WHERE solves.user_id = users.id
            ORDER BY solves.rating_snapshot DESC NULLS LAST, solves.first_solved_at DESC LIMIT 1)
            AS highest_problem_name
        FROM users
        LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
        LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
        LEFT JOIN user_wallets AS wallet ON wallet.user_id = users.id
        LEFT JOIN LATERAL (
          SELECT sum(amount) FILTER (WHERE type NOT IN ('REDEEM', 'REFUND')) AS cc_point
          FROM point_transactions WHERE user_id = users.id
        ) AS points ON true
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
        this.streaks.summary(user.userId),
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
        LEFT JOIN streak_rescues AS rescues ON rescues.reward_order_id = orders.id
        WHERE orders.user_id = ${user.userId} AND orders.status = 'FULFILLED'
          AND rescues.id IS NULL
        ORDER BY orders.reviewed_at DESC NULLS LAST LIMIT 8
      `,
      ]);
    return {
      profile: profile[0] ?? null,
      season: seasons[0] ?? null,
      streak: {
        current_streak: streak.currentStreak,
        longest_streak: streak.longestStreak,
        pending_bonus: streak.pendingBonus,
        settled_bonus: streak.settledBonus,
      },
      tags,
      activity,
      transactions,
      awards,
      fulfilledRewards,
    };
  }

  @Get('me/recognition')
  async ownRecognition(@CurrentUser() user: AuthUser) {
    return this.recognition(user.userId, true);
  }

  @OptionalAuth()
  @Get('students/:userId/profile')
  async studentProfile(@Param('userId') userIdInput: string, @OptionalUser() viewer?: AuthUser) {
    const userId = z.string().uuid().safeParse(userIdInput);
    if (!userId.success) throw new BadRequestException('ID học sinh không hợp lệ');
    const canViewPointHistory =
      viewer?.userId === userId.data || viewer?.systemRole === 'SYSTEM_ADMIN';
    return this.recognition(userId.data, canViewPointHistory);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/users/:userId/recognition')
  async adminRecognition(@Param('userId') userIdInput: string) {
    const userId = z.string().uuid().safeParse(userIdInput);
    if (!userId.success) throw new BadRequestException('ID học sinh không hợp lệ');
    return this.recognition(userId.data, true);
  }

  @OptionalAuth()
  @Get('leaderboards')
  async leaderboard(@Query() raw: unknown, @OptionalUser() user?: AuthUser) {
    const parsed = leaderboardQuery.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Bộ lọc bảng xếp hạng không hợp lệ');
    const input = parsed.data;
    let organizationId = input.organizationId ?? null;
    let seasonId = input.seasonId ?? null;
    let share: { public_key: string; organization_name: string | null } | null = null;
    if (input.shareKey) {
      const [link] = await this.database.sql<
        { organization_id: string | null; public_key: string; organization_name: string | null }[]
      >`
        SELECT links.organization_id, links.public_key, organizations.name AS organization_name
        FROM leaderboard_share_links AS links
        LEFT JOIN organizations ON organizations.id = links.organization_id
        WHERE links.public_key = ${input.shareKey} AND links.active = true
      `;
      if (!link)
        throw new BadRequestException('Liên kết bảng xếp hạng không hợp lệ hoặc đã thu hồi');
      organizationId = link.organization_id;
      seasonId = null;
      share = { public_key: link.public_key, organization_name: link.organization_name };
    } else if (seasonId) {
      const [season] = await this.database.sql<{ organization_id: string | null }[]>`
        SELECT organization_id FROM seasons WHERE id = ${seasonId}
      `;
      if (!season) throw new BadRequestException('Không tìm thấy mùa giải');
      if (organizationId && season.organization_id !== organizationId) {
        throw new BadRequestException('Mùa giải không thuộc tổ chức đã chọn');
      }
      organizationId = season.organization_id;
    }
    if (organizationId && !input.shareKey) {
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
      SELECT users.id AS user_id, users.display_name, users.avatar_url,
        accounts.handle AS codeforces_handle, accounts.current_rating,
        COALESCE(skill.cc_level, 800)::text AS cc_level,
        COALESCE(points.cc_point, 0)::text AS cc_point,
        COALESCE(wallet.balance, 0)::text AS cc_balance,
        COALESCE(streak.current_streak, 0)::int AS current_streak,
        COALESCE(streak.longest_streak, 0)::int AS longest_streak,
        level_rank.name AS level_rank_name, level_rank.icon AS level_rank_icon,
        level_rank.color AS level_rank_color
      FROM users
      ${organizationId ? this.database.sql`JOIN organization_memberships AS memberships ON memberships.user_id = users.id AND memberships.organization_id = ${organizationId} AND memberships.status = 'ACTIVE' AND memberships.role = 'MEMBER'` : this.database.sql``}
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      LEFT JOIN user_wallets AS wallet ON wallet.user_id = users.id
      LEFT JOIN LATERAL (
        SELECT sum(amount) FILTER (WHERE type NOT IN ('REDEEM', 'REFUND')) AS cc_point
        FROM point_transactions WHERE user_id = users.id
      ) AS points ON true
      LEFT JOIN LATERAL (
        WITH raw_days AS (
          SELECT DISTINCT (first_solved_at AT TIME ZONE users.timezone)::date AS day,
            (now() AT TIME ZONE users.timezone)::date AS today, true AS is_solve
          FROM user_problem_solves WHERE user_id = users.id
          UNION ALL
          SELECT rescued_date AS day, (now() AT TIME ZONE users.timezone)::date AS today,
            false AS is_solve
          FROM streak_rescues WHERE user_id = users.id
        ), days AS (
          SELECT day, today, bool_or(is_solve) AS is_solve
          FROM raw_days GROUP BY day, today
        ), grouped AS (
          SELECT day, today, is_solve, day - row_number() OVER (ORDER BY day)::int AS island
          FROM days
        ), runs AS (
          SELECT count(*) FILTER (WHERE is_solve)::int AS length,
            max(day) AS end_day, max(today) AS today
          FROM grouped GROUP BY island
        )
        SELECT COALESCE(max(length), 0)::int AS longest_streak,
          COALESCE(max(length) FILTER (WHERE end_day IN (today, today - 1)), 0)::int
            AS current_streak
        FROM runs
      ) AS streak ON true
      LEFT JOIN LATERAL (
        SELECT name, icon, color FROM cc_level_ranks
        WHERE active = true AND min_level <= COALESCE(skill.cc_level, 800)
        ORDER BY min_level DESC LIMIT 1
      ) AS level_rank ON true
      WHERE users.status = 'ACTIVE' AND (
        users.system_role = 'SYSTEM_ADMIN' OR (
          users.system_role = 'USER' AND NOT EXISTS (
            SELECT 1 FROM organization_memberships AS staff_memberships
            WHERE staff_memberships.user_id = users.id
              AND staff_memberships.status = 'ACTIVE'
              AND staff_memberships.role IN ('TEACHER', 'ORG_ADMIN')
          )
        )
      )
      ORDER BY
        CASE WHEN ${input.sort} = 'CC_LEVEL' THEN COALESCE(skill.cc_level, 800) END DESC,
        CASE WHEN ${input.sort} = 'CC_POINT' THEN COALESCE(points.cc_point, 0) END DESC,
        CASE WHEN ${input.sort} = 'CC_BALANCE' THEN COALESCE(wallet.balance, 0) END DESC,
        CASE WHEN ${input.sort} = 'STREAK' THEN COALESCE(streak.current_streak, 0) END DESC,
        COALESCE(skill.cc_level, 800) DESC, users.id
      LIMIT ${input.pageSize} OFFSET ${offset}
    `;
    const [{ count } = { count: '0' }] = await this.database.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM users
      ${organizationId ? this.database.sql`JOIN organization_memberships AS memberships ON memberships.user_id = users.id AND memberships.organization_id = ${organizationId} AND memberships.status = 'ACTIVE' AND memberships.role = 'MEMBER'` : this.database.sql``}
      WHERE users.status = 'ACTIVE' AND (
        users.system_role = 'SYSTEM_ADMIN' OR (
          users.system_role = 'USER' AND NOT EXISTS (
            SELECT 1 FROM organization_memberships AS staff_memberships
            WHERE staff_memberships.user_id = users.id
              AND staff_memberships.status = 'ACTIVE'
              AND staff_memberships.role IN ('TEACHER', 'ORG_ADMIN')
          )
        )
      )
    `;
    return {
      seasonId,
      organizationId,
      page: input.page,
      pageSize: input.pageSize,
      total: Number(count),
      entries: rows.map((row, index) => ({
        rank: offset + index + 1,
        userId: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        codeforcesHandle: row.codeforces_handle,
        currentRating: row.current_rating,
        ccLevel: row.cc_level,
        ccPoint: row.cc_point,
        ccBalance: row.cc_balance,
        streak: row.current_streak,
        longestStreak: row.longest_streak,
        levelRank: row.level_rank_name
          ? {
              name: row.level_rank_name,
              icon: row.level_rank_icon,
              color: row.level_rank_color,
            }
          : null,
      })),
      share: share
        ? {
            publicKey: share.public_key,
            scope: organizationId ? 'ORGANIZATION' : 'ALL',
            organizationName: share.organization_name,
          }
        : null,
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

  private async recognition(userId: string, includePointHistory = false) {
    const [profiles, streak, awards, rewards, topTags, recognitionQuotes, pointHistory] =
      await Promise.all([
        this.database.sql`
        SELECT users.id, users.full_name, users.display_name, users.avatar_url,
          accounts.handle AS codeforces_handle, accounts.current_rating, accounts.max_rating,
          accounts.rank AS codeforces_rank, accounts.max_rank AS codeforces_max_rank,
          COALESCE(skill.cc_base, 800)::text AS cc_base,
          COALESCE(skill.cc_level, 800)::text AS cc_level,
          COALESCE(wallet.balance, 0)::text AS cc_balance,
          COALESCE(points.cc_point, 0)::text AS cc_point,
          COALESCE(cash.fulfilled_vnd, 0)::text AS cash_received_vnd,
          level_rank.name AS level_rank_name, level_rank.icon AS level_rank_icon,
          level_rank.color AS level_rank_color, level_rank.min_level AS level_rank_min_level,
          ARRAY(SELECT organizations.name
            FROM organization_memberships AS memberships
            JOIN organizations ON organizations.id = memberships.organization_id
            WHERE memberships.user_id = users.id AND memberships.status = 'ACTIVE'
              AND memberships.role = 'MEMBER'
            ORDER BY organizations.name) AS classes,
          (SELECT count(*)::int FROM user_problem_solves WHERE user_id = users.id) AS total_solves,
          (SELECT count(*)::int FROM user_problem_solves
            WHERE user_id = users.id AND first_solved_at >= now() - interval '30 days')
            AS solves_last_30_days,
          (SELECT max(rating_snapshot)::int FROM user_problem_solves WHERE user_id = users.id)
            AS highest_problem_rating,
          (SELECT problems.name FROM user_problem_solves AS solves
            JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
            WHERE solves.user_id = users.id
            ORDER BY solves.rating_snapshot DESC NULLS LAST, solves.first_solved_at DESC LIMIT 1)
            AS highest_problem_name
        FROM users
        LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
        LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
        LEFT JOIN user_wallets AS wallet ON wallet.user_id = users.id
        LEFT JOIN LATERAL (
          SELECT sum(amount) FILTER (WHERE type NOT IN ('REDEEM', 'REFUND')) AS cc_point
          FROM point_transactions WHERE user_id = users.id
        ) AS points ON true
        LEFT JOIN LATERAL (
          SELECT sum(rewards.cash_value_vnd) AS fulfilled_vnd
          FROM reward_orders AS orders
          JOIN rewards ON rewards.id = orders.reward_id
          WHERE orders.user_id = users.id AND orders.status = 'FULFILLED'
            AND rewards.cash_value_vnd IS NOT NULL
        ) AS cash ON true
        LEFT JOIN LATERAL (
          SELECT min_level, name, icon, color FROM cc_level_ranks
          WHERE active = true AND min_level <= COALESCE(skill.cc_level, 800)
          ORDER BY min_level DESC LIMIT 1
        ) AS level_rank ON true
        WHERE users.id = ${userId} AND users.status = 'ACTIVE'
      `,
        this.streaks.summary(userId),
        this.database.sql`
        SELECT awards.award_type, awards.title, awards.awarded_at, seasons.name AS season_name
        FROM season_awards AS awards
        JOIN seasons ON seasons.id = awards.season_id
        WHERE awards.user_id = ${userId}
        ORDER BY awards.awarded_at DESC LIMIT 12
      `,
        this.database.sql`
        SELECT rewards.name, rewards.description, rewards.image_url, rewards.cash_value_vnd,
          orders.reviewed_at AS earned_at
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        LEFT JOIN streak_rescues AS rescues ON rescues.reward_order_id = orders.id
        WHERE orders.user_id = ${userId} AND orders.status = 'FULFILLED'
          AND rescues.id IS NULL
        ORDER BY orders.reviewed_at DESC NULLS LAST LIMIT 12
      `,
        this.database.sql`
        SELECT tags.tag, count(DISTINCT solves.problem_key)::int AS solved_count,
          max(solves.rating_snapshot)::int AS max_rating
        FROM user_problem_solves AS solves
        JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
        CROSS JOIN LATERAL unnest(problems.tags) AS tags(tag)
        WHERE solves.user_id = ${userId}
        GROUP BY tags.tag
        ORDER BY solved_count DESC, max_rating DESC NULLS LAST, tags.tag
        LIMIT 8
      `,
        this.database.sql`
        SELECT content, author
        FROM motivational_quotes
        WHERE active = true
        ORDER BY random()
        LIMIT 1
      `,
        includePointHistory
          ? this.database.sql`
            WITH history AS (
              SELECT transactions.*,
                sum(amount) FILTER (WHERE type NOT IN ('REDEEM', 'REFUND')) OVER (
                  ORDER BY event_at, created_at, id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS cc_point_after_value,
                sum(amount) FILTER (WHERE affects_wallet) OVER (
                  ORDER BY event_at, created_at, id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS cc_balance_after_value
              FROM point_transactions AS transactions
              WHERE user_id = ${userId}
            ), earn_levels AS (
              SELECT id,
                lead(cc_level_before) OVER (ORDER BY event_at, created_at, id)
                  AS next_cc_level_before
              FROM point_transactions
              WHERE user_id = ${userId} AND type = 'EARN'
            )
            SELECT history.id, history.type, history.amount::text, history.description,
              history.event_at, history.created_at, history.source_submission_id::text,
              history.problem_rating_snapshot,
              submissions.programming_language,
              problems.problem_key, problems.contest_id::text, problems.problem_index,
              problems.name AS problem_name,
              history.cc_level_before::text,
              CASE WHEN history.type = 'EARN' THEN COALESCE(
                history.metadata->>'ccLevelAfter',
                earn_levels.next_cc_level_before::text,
                skill.cc_level::text,
                history.cc_level_before::text
              ) ELSE NULL END AS cc_level_after,
              CASE WHEN history.type NOT IN ('REDEEM', 'REFUND') THEN history.amount ELSE 0 END::text
                AS cc_point_delta,
              CASE WHEN history.affects_wallet THEN history.amount ELSE 0 END::text
                AS cc_balance_delta,
              COALESCE(history.cc_point_after_value, 0)::text AS cc_point_after,
              COALESCE(history.cc_balance_after_value, 0)::text AS cc_balance_after
            FROM history
            LEFT JOIN earn_levels ON earn_levels.id = history.id
            LEFT JOIN cf_submissions AS submissions
              ON submissions.cf_submission_id = history.source_submission_id
            LEFT JOIN cf_problems AS problems ON problems.problem_key = submissions.problem_key
            LEFT JOIN user_skill_state AS skill ON skill.user_id = history.user_id
            ORDER BY history.event_at DESC, history.created_at DESC, history.id DESC
            LIMIT 50
          `
          : Promise.resolve([]),
      ]);
    const profile = profiles[0];
    if (!profile) throw new BadRequestException('Không tìm thấy học sinh');
    return {
      profile,
      streak: {
        current_streak: streak.currentStreak,
        longest_streak: streak.longestStreak,
        pending_bonus: streak.pendingBonus,
        settled_bonus: streak.settledBonus,
        timeline: streak.timeline,
        rescue: streak.rescue,
        bonus_milestones: streak.bonusMilestones,
      },
      awards,
      rewards,
      topTags,
      pointHistory,
      quote: recognitionQuotes[0] ?? null,
      generatedAt: new Date().toISOString(),
    };
  }
}
