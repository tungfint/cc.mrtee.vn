import { Injectable } from '@nestjs/common';
import { calculateCcLevel, calculateReward } from '@cc/core';
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
        await transaction`
          INSERT INTO point_transactions (
            user_id, type, amount, source_submission_id, idempotency_key,
            cc_level_before, problem_rating_snapshot, scoring_policy_version,
            affects_wallet, affects_season, event_at
          ) VALUES (
            ${userId}, 'EARN', ${amount}, ${canonical.cf_submission_id},
            ${`earn:submission:${canonical.cf_submission_id}`}, ${state.cc_level},
            ${canonical.problem_rating_observed}, ${policy.version}, true, false,
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
}
