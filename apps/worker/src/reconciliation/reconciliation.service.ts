import { Injectable } from '@nestjs/common';
import { calculateCcLevel, calculateReward } from '@cc/core';
import { DatabaseService } from '../database/database.service';

interface InvalidSolve {
  user_id: string;
  problem_key: string;
  first_ok_submission_id: string;
}

interface SubmissionRow {
  cf_submission_id: string;
  creation_time: Date | string;
  problem_rating_observed: number | null;
}

interface EarnRow {
  id: string;
  amount: string;
  season_id: string | null;
  affects_season: boolean;
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

@Injectable()
export class ReconciliationService {
  constructor(private readonly database: DatabaseService) {}

  async reconcileUser(userId: string, eligibleFrom: Date | null) {
    const invalid = await this.database.sql<InvalidSolve[]>`
      SELECT solves.user_id, solves.problem_key, solves.first_ok_submission_id
      FROM user_problem_solves AS solves
      JOIN cf_submissions AS submissions
        ON submissions.cf_submission_id = solves.first_ok_submission_id
        AND submissions.user_id = solves.user_id
      JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
      WHERE solves.user_id = ${userId}
        AND (submissions.verdict <> 'OK' OR submissions.is_team OR problems.type <> 'PROGRAMMING')
      ORDER BY solves.problem_key
    `;
    let corrected = 0;
    for (const solve of invalid) {
      if (await this.reconcileSolve(solve, eligibleFrom)) corrected += 1;
    }
    return { corrected };
  }

  private reconcileSolve(solve: InvalidSolve, eligibleFrom: Date | null) {
    return this.database.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(
          ${`${solve.user_id}:${solve.problem_key}`}, 0
        ))
      `;
      const [current] = await transaction<InvalidSolve[]>`
        SELECT solves.user_id, solves.problem_key, solves.first_ok_submission_id
        FROM user_problem_solves AS solves
        JOIN cf_submissions AS submissions
          ON submissions.cf_submission_id = solves.first_ok_submission_id
          AND submissions.user_id = solves.user_id
        JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
        WHERE solves.user_id = ${solve.user_id} AND solves.problem_key = ${solve.problem_key}
          AND (submissions.verdict <> 'OK' OR submissions.is_team OR problems.type <> 'PROGRAMMING')
        FOR UPDATE OF solves
      `;
      if (!current) return false;
      const [earn] = await transaction<EarnRow[]>`
        SELECT id, amount, season_id, affects_season
        FROM point_transactions
        WHERE user_id = ${solve.user_id} AND type = 'EARN'
          AND source_submission_id = ${current.first_ok_submission_id}
        FOR UPDATE
      `;
      let reversalId: string | null = null;
      let closedSeasonId: string | null = null;
      if (earn) {
        const reversalAmount = -Number(earn.amount);
        const [reversal] = await transaction<{ id: string }[]>`
          INSERT INTO point_transactions (
            user_id, type, amount, season_id, related_transaction_id, idempotency_key,
            affects_wallet, affects_season, description, metadata, event_at
          ) VALUES (
            ${solve.user_id}, 'REVERSAL', ${reversalAmount}, ${earn.season_id}, ${earn.id},
            ${`reversal:rejudge:${earn.id}`}, true, ${earn.affects_season},
            'Codeforces rejudge invalidated the rewarded first solve',
            ${JSON.stringify({ invalidSubmissionId: current.first_ok_submission_id })}::jsonb,
            now()
          ) ON CONFLICT DO NOTHING RETURNING id
        `;
        reversalId = reversal?.id ?? null;
        if (reversal) {
          await transaction`
            INSERT INTO user_wallets (user_id, balance)
            VALUES (${solve.user_id}, ${reversalAmount})
            ON CONFLICT (user_id) DO UPDATE SET
              balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
          `;
          if (earn.affects_season && earn.season_id) {
            await transaction`
              UPDATE season_user_totals SET
                earned = earned + ${reversalAmount}, score = score + ${reversalAmount},
                qualifying_solves = GREATEST(0, qualifying_solves - 1), updated_at = now()
              WHERE season_id = ${earn.season_id} AND user_id = ${solve.user_id}
            `;
            const [closed] = await transaction<{ id: string }[]>`
              SELECT id FROM seasons WHERE id = ${earn.season_id} AND status = 'CLOSED'
            `;
            closedSeasonId = closed?.id ?? null;
          }
        }
      }

      const [replacement] = await transaction<SubmissionRow[]>`
        SELECT submissions.cf_submission_id, submissions.creation_time,
          submissions.problem_rating_observed
        FROM cf_submissions AS submissions
        JOIN cf_problems AS problems ON problems.problem_key = submissions.problem_key
        WHERE submissions.user_id = ${solve.user_id}
          AND submissions.problem_key = ${solve.problem_key}
          AND submissions.verdict = 'OK' AND submissions.is_team = false
          AND problems.type = 'PROGRAMMING'
        ORDER BY submissions.creation_time, submissions.cf_submission_id
        LIMIT 1
      `;
      let replacementEarnId: string | null = null;
      if (replacement) {
        const solvedAt = new Date(replacement.creation_time);
        const rewardEligible =
          eligibleFrom !== null &&
          solvedAt >= eligibleFrom &&
          replacement.problem_rating_observed !== null;
        await transaction`
          UPDATE user_problem_solves SET
            first_ok_submission_id = ${replacement.cf_submission_id},
            first_solved_at = ${solvedAt.toISOString()},
            rating_snapshot = ${replacement.problem_rating_observed},
            reward_eligible = ${rewardEligible}
          WHERE user_id = ${solve.user_id} AND problem_key = ${solve.problem_key}
        `;
        if (rewardEligible) {
          replacementEarnId = await this.rewardReplacement(
            transaction,
            solve.user_id,
            replacement,
            solvedAt,
          );
        }
      } else {
        await transaction`
          DELETE FROM user_problem_solves
          WHERE user_id = ${solve.user_id} AND problem_key = ${solve.problem_key}
        `;
      }
      await this.recomputeSkill(transaction, solve.user_id);
      const auditPayload = {
        problemKey: solve.problem_key,
        invalidSubmissionId: current.first_ok_submission_id,
        replacementSubmissionId: replacement?.cf_submission_id ?? null,
        reversalTransactionId: reversalId,
        replacementEarnTransactionId: replacementEarnId,
      };
      await transaction`
        INSERT INTO audit_logs (action, entity_type, entity_id, after, reason)
        VALUES (
          'REJUDGE_RECONCILED', 'user_problem_solve',
          ${`${solve.user_id}:${solve.problem_key}`}, ${JSON.stringify(auditPayload)}::jsonb,
          'Codeforces changed the canonical submission validity'
        )
      `;
      if (closedSeasonId) {
        await transaction`
          INSERT INTO audit_logs (action, entity_type, entity_id, after, reason)
          VALUES (
            'CLOSED_SEASON_CORRECTION_RECORDED', 'season', ${closedSeasonId},
            ${JSON.stringify(auditPayload)}::jsonb,
            'Ledger and aggregate corrected; immutable closure snapshot retained for review'
          )
        `;
      }
      return true;
    });
  }

  private async rewardReplacement(
    transaction: import('postgres').TransactionSql,
    userId: string,
    submission: SubmissionRow,
    solvedAt: Date,
  ) {
    await transaction`INSERT INTO user_skill_state (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const [state] = await transaction<
      { cc_base: string; cc_level: string; scoring_policy_version: string }[]
    >`
      SELECT cc_base, cc_level, scoring_policy_version FROM user_skill_state
      WHERE user_id = ${userId} FOR UPDATE
    `;
    const [policy] = await transaction<PolicyRow[]>`
      SELECT * FROM scoring_policies WHERE version = ${state?.scoring_policy_version ?? 'v2.0'}
    `;
    if (!state || !policy || submission.problem_rating_observed === null) return null;
    const amount = calculateReward(submission.problem_rating_observed, Number(state.cc_level), {
      min: Number(policy.reward_min),
      max: Number(policy.reward_max),
      midpointDelta: Number(policy.reward_midpoint_delta),
      scale: Number(policy.reward_scale),
    });
    const solves = await transaction<{ problem_key: string; rating_snapshot: number }[]>`
      SELECT problem_key, rating_snapshot FROM user_problem_solves
      WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
    `;
    const nextLevel = calculateCcLevel(
      solves.map((item) => ({
        problemKey: item.problem_key,
        rating: Number(item.rating_snapshot),
      })),
      {
        decay: Number(policy.level_decay),
        denominator: Number(policy.level_denominator),
        base: Number(state.cc_base),
      },
    );
    const [season] = await transaction<{ id: string }[]>`
      SELECT seasons.id FROM seasons
      WHERE seasons.status <> 'DRAFT'
        AND seasons.start_at <= ${solvedAt.toISOString()}
        AND seasons.end_at > ${solvedAt.toISOString()}
        AND (
          seasons.organization_id IS NULL OR EXISTS (
            SELECT 1 FROM organization_memberships
            WHERE organization_id = seasons.organization_id AND user_id = ${userId}
              AND status = 'ACTIVE'
          )
        )
      ORDER BY (seasons.organization_id IS NULL), seasons.start_at DESC LIMIT 1
    `;
    const [created] = await transaction<{ id: string }[]>`
      INSERT INTO point_transactions (
        user_id, type, amount, season_id, source_submission_id, idempotency_key,
        affects_wallet, affects_season, cc_level_before, problem_rating_snapshot,
        scoring_policy_version, description, metadata, event_at
      ) VALUES (
        ${userId}, 'EARN', ${amount}, ${season?.id ?? null}, ${submission.cf_submission_id},
        ${`earn:submission:${submission.cf_submission_id}`}, true, ${Boolean(season)},
        ${state.cc_level}, ${submission.problem_rating_observed}, ${policy.version},
        'Replacement reward after Codeforces rejudge',
        ${JSON.stringify({
          ccLevelAfter: nextLevel.level,
          ccLevelDelta: nextLevel.level - Number(state.cc_level),
        })}::jsonb,
        ${solvedAt.toISOString()}
      ) ON CONFLICT DO NOTHING RETURNING id
    `;
    if (!created) return null;
    await transaction`
      INSERT INTO user_wallets (user_id, balance) VALUES (${userId}, ${amount})
      ON CONFLICT (user_id) DO UPDATE SET
        balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
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
          reached_score_at = EXCLUDED.reached_score_at, updated_at = now()
      `;
    }
    return created.id;
  }

  private async recomputeSkill(transaction: import('postgres').TransactionSql, userId: string) {
    await transaction`INSERT INTO user_skill_state (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const [state] = await transaction<{ cc_base: string; scoring_policy_version: string }[]>`
      SELECT cc_base, scoring_policy_version FROM user_skill_state WHERE user_id = ${userId} FOR UPDATE
    `;
    const [policy] = await transaction<PolicyRow[]>`
      SELECT * FROM scoring_policies WHERE version = ${state?.scoring_policy_version ?? 'v2.0'}
    `;
    if (!state || !policy) throw new Error('Scoring policy is unavailable');
    const solves = await transaction<{ problem_key: string; rating_snapshot: number }[]>`
      SELECT problem_key, rating_snapshot FROM user_problem_solves
      WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
    `;
    const result = calculateCcLevel(
      solves.map((item) => ({
        problemKey: item.problem_key,
        rating: Number(item.rating_snapshot),
      })),
      {
        decay: Number(policy.level_decay),
        denominator: Number(policy.level_denominator),
        base: Number(state.cc_base),
      },
    );
    await transaction`
      UPDATE user_skill_state SET cc_calculated = ${result.calculated}, cc_level = ${result.level},
        updated_at = now() WHERE user_id = ${userId}
    `;
  }
}
