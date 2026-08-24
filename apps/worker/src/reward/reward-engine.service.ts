import { Injectable } from '@nestjs/common';
import {
  calculateCcLevelGain,
  calculateDailyStreakBonus,
  calculateReward,
  round2,
  round4,
} from '@cc/core';
import { DatabaseService } from '../database/database.service';
import type { IngestedSubmission } from '../ingestion/submission-ingestion.service';

interface SkillStateRow {
  cc_level: string;
  scoring_policy_version: string;
}

interface PolicyRow {
  version: string;
  level_decay: string;
  level_denominator: string;
  level_mastery_factor: string;
  level_mastery_scale: string;
  level_mastery_rating_step: string;
  level_initial: string;
  level_gain_max: string;
  level_gain_scale: string;
  max_positive_delta: string;
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
        SELECT cc_level, scoring_policy_version
        FROM user_skill_state WHERE user_id = ${userId} FOR UPDATE
      `;
      if (!state) throw new Error('Skill state initialization failed');
      const [policy] = await transaction<PolicyRow[]>`
        SELECT version, level_decay, level_denominator, level_mastery_factor,
          level_mastery_scale, level_mastery_rating_step, level_initial,
          level_gain_max, level_gain_scale, max_positive_delta,
          reward_min, reward_max, reward_midpoint_delta, reward_scale
        FROM scoring_policies WHERE version = ${state.scoring_policy_version}
      `;
      if (!policy) throw new Error('Scoring policy is unavailable');

      const displayLevelBefore = Number(state.cc_level);
      const rewardReferenceLevelBefore = displayLevelBefore;
      const levelGain =
        canonical.problem_rating_observed === null
          ? 0
          : calculateCcLevelGain(Number(canonical.problem_rating_observed), displayLevelBefore, {
              initialLevel: Number(policy.level_initial),
              gainMax: Number(policy.level_gain_max),
              gainScale: Number(policy.level_gain_scale),
              maxPositiveDelta: Number(policy.max_positive_delta),
            });
      const nextLevel = round4(displayLevelBefore + levelGain);

      let amount = 0;
      if (rewardEligible && canonical.problem_rating_observed !== null) {
        amount = calculateReward(
          Number(canonical.problem_rating_observed),
          rewardReferenceLevelBefore,
          {
            min: Number(policy.reward_min),
            max: Number(policy.reward_max),
            midpointDelta: Number(policy.reward_midpoint_delta),
            scale: Number(policy.reward_scale),
            maxPositiveDelta: Number(policy.max_positive_delta),
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
            affects_wallet, affects_season, metadata, event_at
          ) VALUES (
            ${userId}, 'EARN', ${amount}, ${season?.id ?? null}, ${canonical.cf_submission_id},
            ${`earn:submission:${canonical.cf_submission_id}`}, ${rewardReferenceLevelBefore},
            ${canonical.problem_rating_observed}, ${policy.version}, true, ${Boolean(season)},
            ${JSON.stringify({
              displayCcLevelBefore: displayLevelBefore,
              rewardReferenceLevelBefore,
              ccLevelAfter: nextLevel,
              ccLevelDelta: levelGain,
            })}::jsonb,
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
        await this.recordRiskSignals(
          transaction,
          userId,
          canonical.cf_submission_id,
          solvedAt,
          Number(canonical.problem_rating_observed),
          rewardReferenceLevelBefore,
        );
      }

      await transaction`
        UPDATE user_skill_state
        SET cc_calculated = ${nextLevel}, cc_mastery_bonus = 0,
          cc_level = ${nextLevel}, updated_at = now()
        WHERE user_id = ${userId}
      `;
      await this.awardLevelRanks(transaction, userId, displayLevelBefore, nextLevel);
      if (eligibleFrom && solvedAt >= eligibleFrom) {
        await this.awardDailyStreak(transaction, userId, solvedAt, eligibleFrom);
      }
      return { firstSolveCreated: true, awarded: rewardEligible, amount };
    });
  }

  private async awardLevelRanks(
    transaction: import('postgres').TransactionSql,
    userId: string,
    levelBefore: number,
    levelAfter: number,
  ) {
    if (levelAfter <= levelBefore) return;
    const ranks = await transaction<
      { id: string; name: string; min_level: number; reward_point: string }[]
    >`
      SELECT id, name, min_level, reward_point::text FROM cc_level_ranks
      WHERE active = true
        AND min_level::numeric > ${levelBefore}::numeric
        AND min_level::numeric <= ${levelAfter}::numeric
      ORDER BY min_level
    `;
    for (const rank of ranks) {
      const [award] = await transaction<{ id: string }[]>`
        INSERT INTO user_level_rank_awards (user_id, rank_id, achieved_level, source)
        VALUES (${userId}, ${rank.id}, ${levelAfter}, 'SOLVE')
        ON CONFLICT (user_id, rank_id) DO NOTHING RETURNING id
      `;
      if (!award) continue;
      const rewardPoint = Number(rank.reward_point);
      if (rewardPoint > 0) {
        const [pointTransaction] = await transaction<{ id: string }[]>`
          INSERT INTO point_transactions (
            user_id, type, amount, idempotency_key, affects_wallet, affects_point,
            affects_season, description, metadata, event_at
          ) VALUES (
            ${userId}, 'BONUS', ${rewardPoint}, ${`level-rank:${userId}:${rank.id}`},
            true, true, false, ${`Thưởng lần đầu đạt cấp bậc ${rank.name}`},
            ${JSON.stringify({
              source: 'CC_LEVEL_RANK',
              rankId: rank.id,
              rankName: rank.name,
              minLevel: rank.min_level,
              achievedLevel: levelAfter,
            })}::jsonb,
            now()
          ) ON CONFLICT DO NOTHING RETURNING id
        `;
        if (pointTransaction) {
          await transaction`
            UPDATE user_level_rank_awards SET point_transaction_id = ${pointTransaction.id}
            WHERE id = ${award.id}
          `;
          await transaction`
            INSERT INTO user_wallets (user_id, balance) VALUES (${userId}, ${rewardPoint})
            ON CONFLICT (user_id) DO UPDATE SET
              balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
          `;
        }
      }
      const [notification] = await transaction<{ id: string }[]>`
        INSERT INTO notifications (title, body, audience, target_user_id, publish_at)
        VALUES (
          ${`Chúc mừng đạt cấp bậc ${rank.name}`},
          ${
            rewardPoint > 0
              ? `Bạn lần đầu đạt cấp bậc ${rank.name} và nhận ${rewardPoint} CC Point cùng ${rewardPoint} CC Balance.`
              : `Bạn đã lần đầu đạt cấp bậc ${rank.name}.`
          },
          'USER', ${userId}, now()
        ) RETURNING id
      `;
      if (notification) {
        await transaction`
          INSERT INTO notification_recipients (notification_id, user_id)
          VALUES (${notification.id}, ${userId}) ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  private async awardDailyStreak(
    transaction: import('postgres').TransactionSql,
    userId: string,
    solvedAt: Date,
    eligibleFrom: Date,
  ) {
    const [clock] = await transaction<{ activity_day: string }[]>`
      SELECT (${solvedAt.toISOString()}::timestamptz AT TIME ZONE timezone)::date::text
        AS activity_day
      FROM users WHERE id = ${userId}
    `;
    if (!clock) return;
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`streak-daily:${userId}:${clock.activity_day}`}, 0)
      )
    `;
    const [run] = await transaction<{ streak_day: number }[]>`
      WITH raw_activity AS (
        SELECT (solves.first_solved_at AT TIME ZONE users.timezone)::date AS day,
          true AS is_solve
        FROM user_problem_solves AS solves
        JOIN users ON users.id = solves.user_id
        WHERE solves.user_id = ${userId}
          AND solves.first_solved_at >= ${eligibleFrom.toISOString()}
          AND (solves.first_solved_at AT TIME ZONE users.timezone)::date
            <= ${clock.activity_day}::date
        UNION ALL
        SELECT rescues.rescued_date AS day, false AS is_solve
        FROM streak_rescues AS rescues
        WHERE rescues.user_id = ${userId}
          AND rescues.rescued_date <= ${clock.activity_day}::date
      ), activity_days AS (
        SELECT day, bool_or(is_solve) AS is_solve FROM raw_activity GROUP BY day
      ), grouped AS (
        SELECT day, is_solve, day - row_number() OVER (ORDER BY day)::int AS island
        FROM activity_days
      ), runs AS (
        SELECT max(day) AS end_day, count(*) FILTER (WHERE is_solve)::int AS streak_day
        FROM grouped GROUP BY island
      )
      SELECT streak_day FROM runs WHERE end_day = ${clock.activity_day}::date LIMIT 1
    `;
    const streakDay = run?.streak_day ?? 1;
    const amount = calculateDailyStreakBonus(streakDay);
    if (amount <= 0) return;
    const [created] = await transaction<{ id: string }[]>`
      INSERT INTO point_transactions (
        user_id, type, amount, idempotency_key, affects_wallet, affects_season,
        description, metadata, event_at
      ) VALUES (
        ${userId}, 'BONUS', ${amount},
        ${`streak-daily:${userId}:${clock.activity_day}`}, true, false,
        ${`Thưởng Streak ngày thứ ${streakDay}`},
        ${JSON.stringify({
          source: 'STREAK',
          mode: 'DAILY',
          streakDay,
          activityDate: clock.activity_day,
        })}::text::jsonb,
        ${solvedAt.toISOString()}
      ) ON CONFLICT DO NOTHING RETURNING id
    `;
    if (!created) return;
    await transaction`
      INSERT INTO user_wallets (user_id, balance) VALUES (${userId}, ${amount})
      ON CONFLICT (user_id) DO UPDATE SET
        balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
    `;
    await transaction`
      INSERT INTO audit_logs (action, entity_type, entity_id, after, reason)
      VALUES ('STREAK_BONUS_AWARDED', 'point_transaction', ${created.id},
        ${JSON.stringify({ amount, streakDay, activityDate: clock.activity_day })}::jsonb,
        'Tự động cộng CC Point và CC Balance cho ngày luyện tập trong chuỗi Streak')
    `;
  }

  private async recordRiskSignals(
    transaction: import('postgres').TransactionSql,
    userId: string,
    submissionId: string,
    solvedAt: Date,
    problemRating: number,
    levelBefore: number,
  ) {
    const delta = problemRating - levelBefore;
    const [activity] = await transaction<{ high_delta_count: number; recent_count: number }[]>`
      SELECT
        count(*) FILTER (
          WHERE problem_rating_snapshot - cc_level_before >= 300
            AND event_at >= ${solvedAt.toISOString()}::timestamptz - interval '24 hours'
        )::int AS high_delta_count,
        count(*) FILTER (
          WHERE event_at >= ${solvedAt.toISOString()}::timestamptz - interval '2 hours'
        )::int AS recent_count
      FROM point_transactions
      WHERE user_id = ${userId} AND type = 'EARN'
        AND event_at <= ${solvedAt.toISOString()}
    `;
    const signals: Array<{ code: string; score: number; summary: string; evidence: object }> = [];
    if (delta >= 300) {
      signals.push({
        code: 'HIGH_DIFFICULTY_DELTA',
        score: 2,
        summary: 'Có bài giải cao hơn CC Level từ 300 điểm trở lên',
        evidence: { delta: round2(delta), problemRating, levelBefore },
      });
    }
    if ((activity?.high_delta_count ?? 0) >= 5) {
      signals.push({
        code: 'HIGH_DELTA_BURST_24H',
        score: 3,
        summary: 'Có nhiều bài vượt trình trong vòng 24 giờ',
        evidence: { count: activity?.high_delta_count, windowHours: 24 },
      });
    }
    if ((activity?.recent_count ?? 0) >= 12) {
      signals.push({
        code: 'SOLVE_BURST_2H',
        score: 3,
        summary: 'Có nhiều bài được ghi nhận trong thời gian ngắn',
        evidence: { count: activity?.recent_count, windowHours: 2 },
      });
    }
    const createdSignals: string[] = [];
    for (const signal of signals) {
      const [created] = await transaction<{ id: string }[]>`
        INSERT INTO activity_risk_events (
          user_id, source_submission_id, signal_code, score, summary, evidence, idempotency_key
        ) VALUES (
          ${userId}, ${submissionId}, ${signal.code}, ${signal.score}, ${signal.summary},
          ${JSON.stringify(signal.evidence)}::jsonb,
          ${`risk:${signal.code}:${submissionId}`}
        ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
      `;
      if (!created) continue;
      createdSignals.push(signal.summary);
    }
    await transaction`
      WITH current_risk AS (
        SELECT COALESCE(sum(score), 0)::int AS score
        FROM activity_risk_events
        WHERE user_id = ${userId} AND resolution IS DISTINCT FROM 'VALID'
          AND created_at >= now() - interval '30 days'
      )
      UPDATE users SET
        activity_risk_score = current_risk.score,
        activity_risk_level = CASE
          WHEN current_risk.score >= 10 THEN 'PRIORITY'
          WHEN current_risk.score >= 6 THEN 'REVIEW'
          ELSE 'NORMAL'
        END,
        updated_at = now()
      FROM current_risk WHERE users.id = ${userId}
    `;
    if (createdSignals.length) {
      const [notification] = await transaction<{ id: string }[]>`
        INSERT INTO notifications (title, body, audience, target_user_id, publish_at)
        VALUES (
          'Tài khoản có hoạt động cần kiểm tra',
          ${`Hệ thống ghi nhận: ${createdSignals.join('; ')}. Đây là cảnh báo minh bạch, không phải kết luận gian lận và không tự động giữ điểm.`},
          'USER', ${userId}, now()
        ) RETURNING id
      `;
      if (notification) {
        await transaction`
          INSERT INTO notification_recipients (notification_id, user_id)
          VALUES (${notification.id}, ${userId}) ON CONFLICT DO NOTHING
        `;
      }
    }
  }
}
