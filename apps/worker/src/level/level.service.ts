import { Injectable } from '@nestjs/common';
import { calculateCcLevel } from '@cc/core';
import { DatabaseService } from '../database/database.service';

interface PolicyRow {
  version: string;
  level_initial: string;
  level_gain_max: string;
  level_gain_scale: string;
  max_positive_delta: string;
}

@Injectable()
export class LevelService {
  constructor(private readonly database: DatabaseService) {}

  async recompute(userId: string): Promise<{ calculated: number; level: number; version: string }> {
    const [state] = await this.database.sql<{ scoring_policy_version: string }[]>`
      SELECT scoring_policy_version FROM user_skill_state WHERE user_id = ${userId}
    `;
    const [policy] = await this.database.sql<PolicyRow[]>`
      SELECT version, level_initial, level_gain_max, level_gain_scale, max_positive_delta
      FROM scoring_policies
      WHERE version = ${state?.scoring_policy_version ?? 'v3.0'}
    `;
    if (!policy) throw new Error('Scoring policy is unavailable');
    const solves = await this.database.sql<
      {
        problem_key: string;
        rating_snapshot: number;
        first_solved_at: Date;
        first_ok_submission_id: string;
      }[]
    >`
      SELECT problem_key, rating_snapshot, first_solved_at, first_ok_submission_id
      FROM user_problem_solves
      WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
      ORDER BY first_solved_at, first_ok_submission_id, problem_key
    `;
    const result = calculateCcLevel(
      solves.map((solve) => ({
        problemKey: solve.problem_key,
        rating: Number(solve.rating_snapshot),
        solvedAt: solve.first_solved_at,
        submissionId: solve.first_ok_submission_id,
      })),
      {
        initialLevel: Number(policy.level_initial),
        gainMax: Number(policy.level_gain_max),
        gainScale: Number(policy.level_gain_scale),
        maxPositiveDelta: Number(policy.max_positive_delta),
      },
    );
    await this.database.sql`
      INSERT INTO user_skill_state (
        user_id, cc_base, cc_calculated, cc_mastery_bonus, cc_level, scoring_policy_version
      ) VALUES (
        ${userId},
        ${policy.level_initial},
        ${result.calculated},
        ${result.masteryBonus},
        ${result.level},
        ${policy.version}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        cc_calculated = EXCLUDED.cc_calculated,
        cc_mastery_bonus = EXCLUDED.cc_mastery_bonus,
        cc_level = EXCLUDED.cc_level,
        scoring_policy_version = EXCLUDED.scoring_policy_version,
        updated_at = now()
    `;
    return { ...result, version: policy.version };
  }
}
