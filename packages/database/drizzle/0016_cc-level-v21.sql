ALTER TABLE "user_skill_state" ALTER COLUMN "scoring_policy_version" SET DEFAULT 'v2.1';--> statement-breakpoint
ALTER TABLE "scoring_policies" ADD COLUMN "level_mastery_factor" numeric(10, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_policies" ADD COLUMN "level_mastery_scale" numeric(10, 4) DEFAULT '4' NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_policies" ADD COLUMN "level_mastery_rating_step" numeric(10, 2) DEFAULT '400' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_skill_state" ADD COLUMN "cc_mastery_bonus" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_policies" ADD CONSTRAINT "scoring_policies_mastery_check" CHECK ("scoring_policies"."level_mastery_factor" >= 0 AND "scoring_policies"."level_mastery_scale" > 0 AND "scoring_policies"."level_mastery_rating_step" > 0);--> statement-breakpoint
INSERT INTO "scoring_policies" (
  "version", "level_decay", "level_denominator", "level_mastery_factor",
  "level_mastery_scale", "level_mastery_rating_step", "default_cc_base",
  "reward_min", "reward_max", "reward_midpoint_delta", "reward_scale", "effective_from"
)
SELECT
  'v2.1', "level_decay", "level_denominator", 8, 4, 400, "default_cc_base",
  "reward_min", "reward_max", "reward_midpoint_delta", "reward_scale", now()
FROM "scoring_policies"
WHERE "version" = 'v2.0'
ON CONFLICT ("version") DO NOTHING;--> statement-breakpoint
UPDATE "seasons"
SET "scoring_policy_version" = 'v2.1', "updated_at" = now()
WHERE "status" IN ('DRAFT', 'ACTIVE', 'CLOSING');--> statement-breakpoint
WITH ranked AS (
  SELECT
    solves."user_id",
    solves."rating_snapshot"::double precision AS rating,
    row_number() OVER (
      PARTITION BY solves."user_id"
      ORDER BY solves."rating_snapshot" DESC, solves."problem_key"
    ) AS position
  FROM "user_problem_solves" AS solves
  WHERE solves."rating_snapshot" IS NOT NULL
), aggregates AS (
  SELECT
    state."user_id",
    COALESCE(
      sum(ranked.rating * power(0.95::double precision, ranked.position - 1)) / 20,
      0
    ) AS calculated,
    COALESCE(
      sum(
        least(
          2::double precision,
          greatest(
            0.25::double precision,
            power(2::double precision, (ranked.rating - state."cc_base"::double precision) / 400)
          )
        )
      ),
      0
    ) AS evidence
  FROM "user_skill_state" AS state
  LEFT JOIN ranked ON ranked."user_id" = state."user_id"
  GROUP BY state."user_id"
), recomputed AS (
  SELECT
    state."user_id",
    aggregates.calculated,
    8 * ln(1 + aggregates.evidence / 4) AS mastery_bonus
  FROM "user_skill_state" AS state
  JOIN aggregates ON aggregates."user_id" = state."user_id"
)
UPDATE "user_skill_state" AS state
SET
  "cc_calculated" = round(recomputed.calculated::numeric, 2),
  "cc_mastery_bonus" = round(recomputed.mastery_bonus::numeric, 2),
  "cc_level" = round(
    (greatest(state."cc_base"::double precision, recomputed.calculated) + recomputed.mastery_bonus)::numeric,
    2
  ),
  "scoring_policy_version" = 'v2.1',
  "updated_at" = now()
FROM recomputed
WHERE recomputed."user_id" = state."user_id";
