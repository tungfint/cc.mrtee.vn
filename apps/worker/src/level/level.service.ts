import { Injectable } from '@nestjs/common';
import { calculateCcLevel } from '@cc/core';
import { DatabaseService } from '../database/database.service';

interface PolicyRow {
  version: string;
  level_decay: string;
  level_denominator: string;
  level_mastery_factor: string;
  level_mastery_scale: string;
  level_mastery_rating_step: string;
  default_cc_base: string;
}

@Injectable()
export class LevelService {
  constructor(private readonly database: DatabaseService) {}

  async recompute(userId: string): Promise<{ calculated: number; level: number; version: string }> {
    const [state] = await this.database.sql<{ cc_base: string; scoring_policy_version: string }[]>`
      SELECT cc_base, scoring_policy_version FROM user_skill_state WHERE user_id = ${userId}
    `;
    const [policy] = await this.database.sql<PolicyRow[]>`
      SELECT version, level_decay, level_denominator, level_mastery_factor,
        level_mastery_scale, level_mastery_rating_step, default_cc_base
      FROM scoring_policies
      WHERE version = ${state?.scoring_policy_version ?? 'v2.1'}
    `;
    if (!policy) throw new Error('Scoring policy is unavailable');
    const solves = await this.database.sql<{ problem_key: string; rating_snapshot: number }[]>`
      SELECT problem_key, rating_snapshot
      FROM user_problem_solves
      WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
    `;
    const result = calculateCcLevel(
      solves.map((solve) => ({
        problemKey: solve.problem_key,
        rating: Number(solve.rating_snapshot),
      })),
      {
        decay: Number(policy.level_decay),
        denominator: Number(policy.level_denominator),
        base: Number(state?.cc_base ?? policy.default_cc_base),
        masteryFactor: Number(policy.level_mastery_factor),
        masteryScale: Number(policy.level_mastery_scale),
        masteryRatingStep: Number(policy.level_mastery_rating_step),
      },
    );
    await this.database.sql`
      INSERT INTO user_skill_state (
        user_id, cc_base, cc_calculated, cc_mastery_bonus, cc_level, scoring_policy_version
      ) VALUES (
        ${userId},
        ${state?.cc_base ?? policy.default_cc_base},
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
