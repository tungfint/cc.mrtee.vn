import { Injectable } from '@nestjs/common';
import { calculateCcLevel, calculateReward, calculateStreakBonus } from '@cc/core';
import { DatabaseService } from '../database/database.service';
import type { IngestedSubmission } from '../ingestion/submission-ingestion.service';

interface SkillStateRow {
  cc_base: string;
  cc_level: string;
  scoring_policy_version: string;
}

interface PolicyRow {
  version: string;
  level_decay: string;
  level_denominator: string;
  reward_min: string;
  reward_max: string;
  reward_midpoint_delta: string;
  reward_scale: string;
}

export interface RewardProcessResult {
  firstSolveCreated: boolean;
  awarded: boolean;
  amount: number;
}

@Injectable()
export class RewardEngineService {
  constructor(private readonly database: DatabaseService) {}

  async process(
    userId: string,
    submission: IngestedSubmission,
    eligibleFrom: Date | null,
  ): Promise<RewardProcessResult> {
    if (
      submission.verdict !== 'OK' ||
      submission.isTeam ||
      submission.problemType !== 'PROGRAMMING'
    ) {
      return { firstSolveCreated: false, awarded: false, amount: 0 };
    }

    return this.database.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${submission.problemKey}`}, 0))
      `;
      const [canonical] = await transaction<
        {
          cf_submission_id: string;
          creation_time: Date | string;
          problem_rating_observed: number | null;
        }[]
      >`
        SELECT submissions.cf_submission_id, submissions.creation_time,
          submissions.problem_rating_observed
        FROM cf_submissions AS submissions
        JOIN cf_problems AS problems ON problems.problem_key = submissions.problem_key
        WHERE submissions.user_id = ${userId}
          AND submissions.problem_key = ${submission.problemKey}
          AND submissions.verdict = 'OK'
          AND submissions.is_team = false
          AND problems.type = 'PROGRAMMING'
        ORDER BY submissions.creation_time, submissions.cf_submission_id
        LIMIT 1
      `;
      if (!canonical) return { firstSolveCreated: false, awarded: false, amount: 0 };
      const solvedAt = new Date(canonical.creation_time);
      const rewardEligible =
        eligibleFrom !== null &&
        solvedAt >= eligibleFrom &&
        canonical.problem_rating_observed !== null;
      const [created] = await transaction<{ user_id: string }[]>`
        INSERT INTO user_problem_solves (
          user_id, problem_key, first_ok_submission_id, first_solved_at,
          rating_snapshot, reward_eligible
        ) VALUES (
          ${userId}, ${submission.problemKey}, ${canonical.cf_submission_id},
          ${solvedAt.toISOString()}, ${canonical.problem_rating_observed}, ${rewardEligible}
        )
        ON CONFLICT (user_id, problem_key) DO NOTHING
        RETURNING user_id
      `;
      if (!created) return { firstSolveCreated: false, awarded: false, amount: 0 };

      await transaction`
        INSERT INTO user_skill_state (user_id)
        VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING
      `;
      const [state] = await transaction<SkillStateRow[]>`
        SELECT cc_base, cc_level, scoring_policy_version
        FROM user_skill_state WHERE user_id = ${userId} FOR UPDATE
      `;
      if (!state) throw new Error('Skill state initialization failed');
      const [policy] = await transaction<PolicyRow[]>`
        SELECT version, level_decay, level_denominator, reward_min, reward_max,
          reward_midpoint_delta, reward_scale
        FROM scoring_policies WHERE version = ${state.scoring_policy_version}
      `;
      if (!policy) throw new Error('Scoring policy is unavailable');

      let amount = 0;
      if (rewardEligible && canonical.problem_rating_observed !== null) {
        amount = calculateReward(
          Number(canonical.problem_rating_observed),
          Number(state.cc_level),
          {
            min: Number(policy.reward_min),
            max: Number(policy.reward_max),
            midpointDelta: Number(policy.reward_midpoint_delta),
            scale: Number(policy.reward_scale),
          },
        );
        const [season] = await transaction<{ id: string }[]>`
          SELECT seasons.id
          FROM seasons
          WHERE seasons.status IN ('ACTIVE', 'CLOSING')
            AND seasons.start_at <= ${solvedAt.toISOString()}
            AND seasons.end_at > ${solvedAt.toISOString()}
            AND (
              seasons.organization_id IS NULL OR EXISTS (
                SELECT 1 FROM organization_memberships AS memberships
                WHERE memberships.organization_id = seasons.organization_id
                  AND memberships.user_id = ${userId}
                  AND memberships.status = 'ACTIVE'
              )
            )
          ORDER BY (seasons.organization_id IS NULL), seasons.start_at DESC
          LIMIT 1
        `;
        await transaction`
          INSERT INTO point_transactions (
            user_id, type, amount, season_id, source_submission_id, idempotency_key,
            cc_level_before, problem_rating_snapshot, scoring_policy_version,
            affects_wallet, affects_season, event_at
          ) VALUES (
            ${userId}, 'EARN', ${amount}, ${season?.id ?? null}, ${canonical.cf_submission_id},
            ${`earn:submission:${canonical.cf_submission_id}`}, ${state.cc_level},
            ${canonical.problem_rating_observed}, ${policy.version}, true, ${Boolean(season)},
            ${solvedAt.toISOString()}
          )
        `;
        await transaction`
          INSERT INTO user_wallets (user_id, balance)
          VALUES (${userId}, ${amount})
          ON CONFLICT (user_id) DO UPDATE SET
            balance = user_wallets.balance + EXCLUDED.balance,
            updated_at = now()
        `;
        if (season) {
          await transaction`
            INSERT INTO season_user_totals (
              season_id, user_id, earned, score, qualifying_solves, reached_score_at
            ) VALUES (${season.id}, ${userId}, ${amount}, ${amount}, 1, ${solvedAt.toISOString()})
            ON CONFLICT (season_id, user_id) DO UPDATE SET
              earned = season_user_totals.earned + EXCLUDED.earned,
              score = season_user_totals.score + EXCLUDED.score,
              qualifying_solves = season_user_totals.qualifying_solves + 1,
              reached_score_at = EXCLUDED.reached_score_at,
              updated_at = now()
          `;
        }
      }

      const solves = await transaction<{ problem_key: string; rating_snapshot: number }[]>`
        SELECT problem_key, rating_snapshot FROM user_problem_solves
        WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
      `;
      const nextLevel = calculateCcLevel(
        solves.map((solve) => ({
          problemKey: solve.problem_key,
          rating: Number(solve.rating_snapshot),
        })),
        {
          decay: Number(policy.level_decay),
          denominator: Number(policy.level_denominator),
          base: Number(state.cc_base),
        },
      );
      await transaction`
        UPDATE user_skill_state
        SET cc_calculated = ${nextLevel.calculated}, cc_level = ${nextLevel.level}, updated_at = now()
        WHERE user_id = ${userId}
      `;
      return { firstSolveCreated: true, awarded: rewardEligible, amount };
    });
  }

  async settleExpiredStreaks(userId: string) {
    return this.database.sql.begin((transaction) =>
      this.settleExpiredStreakRuns(transaction, userId),
    );
  }

  private async settleExpiredStreakRuns(
    transaction: import('postgres').TransactionSql,
    userId: string,
  ) {
    const runs = await transaction<{ start_day: string; end_day: string; length: number }[]>`
      WITH raw_activity AS (
        SELECT DISTINCT (solves.first_solved_at AT TIME ZONE users.timezone)::date AS day,
          (now() AT TIME ZONE users.timezone)::date AS today, true AS is_solve
        FROM user_problem_solves AS solves
        JOIN users ON users.id = solves.user_id
        JOIN codeforces_accounts AS accounts ON accounts.user_id = solves.user_id
        WHERE solves.user_id = ${userId}
          AND accounts.reward_eligible_from IS NOT NULL
          AND solves.first_solved_at >= accounts.reward_eligible_from
        UNION ALL
        SELECT rescues.rescued_date AS day,
          (now() AT TIME ZONE users.timezone)::date AS today, false AS is_solve
        FROM streak_rescues AS rescues
        JOIN users ON users.id = rescues.user_id
        WHERE rescues.user_id = ${userId}
      ), activity_days AS (
        SELECT day, today, bool_or(is_solve) AS is_solve
        FROM raw_activity GROUP BY day, today
      ), grouped AS (
        SELECT day, today, is_solve, day - row_number() OVER (ORDER BY day)::int AS island
        FROM activity_days
      )
      SELECT min(day)::text AS start_day, max(day)::text AS end_day,
        count(*) FILTER (WHERE is_solve)::int AS length
      FROM grouped
      GROUP BY island, today
      HAVING max(day) < today - 4
      ORDER BY max(day)
    `;
    for (const run of runs) {
      const amount = calculateStreakBonus(run.length);
      if (amount <= 0) continue;
      const key = `streak-bonus:${userId}:${run.end_day}`;
      const [created] = await transaction<{ id: string }[]>`
        INSERT INTO point_transactions (
          user_id, type, amount, idempotency_key, affects_wallet, affects_season,
          description, metadata, event_at
        ) VALUES (
          ${userId}, 'BONUS', ${amount}, ${key}, true, false,
          ${`Thưởng chuỗi Streak ${run.length} ngày`},
          ${JSON.stringify({
            source: 'STREAK',
            streakDays: run.length,
            startDate: run.start_day,
            endDate: run.end_day,
          })}::jsonb,
          now()
        ) ON CONFLICT DO NOTHING RETURNING id
      `;
      if (!created) continue;
      await transaction`
        INSERT INTO user_wallets (user_id, balance) VALUES (${userId}, ${amount})
        ON CONFLICT (user_id) DO UPDATE SET
          balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
      `;
      await transaction`
        INSERT INTO audit_logs (action, entity_type, entity_id, after, reason)
        VALUES ('STREAK_BONUS_AWARDED', 'point_transaction', ${created.id},
          ${JSON.stringify({ amount, ...run })}::jsonb,
          'Tự động cộng CC Point và CC Balance khi chuỗi Streak kết thúc')
      `;
    }
  }
}
