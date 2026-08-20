import { calculateCcLevel } from '@cc/core';
import type postgres from 'postgres';

interface PolicyRow {
  version: string;
  level_decay: string;
  level_denominator: string;
  level_mastery_factor: string;
  level_mastery_scale: string;
  level_mastery_rating_step: string;
}

export async function setCcBaseAndRecompute(
  transaction: postgres.TransactionSql,
  userId: string,
  ccBase: number,
) {
  const [current] = await transaction<{ scoring_policy_version: string }[]>`
    SELECT scoring_policy_version FROM user_skill_state WHERE user_id = ${userId}
  `;
  const policyVersion = current?.scoring_policy_version ?? 'v2.1';
  const [policy] = await transaction<PolicyRow[]>`
    SELECT version, level_decay, level_denominator, level_mastery_factor,
      level_mastery_scale, level_mastery_rating_step
    FROM scoring_policies WHERE version = ${policyVersion}
  `;
  if (!policy) throw new Error('Scoring policy is unavailable');
  const solves = await transaction<{ problem_key: string; rating_snapshot: number }[]>`
    SELECT problem_key, rating_snapshot FROM user_problem_solves
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
      base: ccBase,
      masteryFactor: Number(policy.level_mastery_factor),
      masteryScale: Number(policy.level_mastery_scale),
      masteryRatingStep: Number(policy.level_mastery_rating_step),
    },
  );
  const [state] = await transaction`
    INSERT INTO user_skill_state (
      user_id, cc_base, cc_calculated, cc_mastery_bonus, cc_level, scoring_policy_version
    ) VALUES (
      ${userId}, ${ccBase}, ${result.calculated}, ${result.masteryBonus}, ${result.level},
      ${policy.version}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      cc_base = EXCLUDED.cc_base,
      cc_calculated = EXCLUDED.cc_calculated,
      cc_mastery_bonus = EXCLUDED.cc_mastery_bonus,
      cc_level = EXCLUDED.cc_level,
      scoring_policy_version = EXCLUDED.scoring_policy_version,
      updated_at = now()
    RETURNING *
  `;
  return state;
}
