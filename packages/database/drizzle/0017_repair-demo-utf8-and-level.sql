UPDATE "cf_problems"
SET
  "name" = 'Dấu mốc bền bỉ ngày ' || split_part("problem_key", 'streak-', 2),
  "updated_at" = now()
WHERE "problem_key" LIKE 'problemset:cc-demo-sadmin:streak-%';--> statement-breakpoint
WITH target AS (
  SELECT
    state."user_id",
    state."cc_base"::double precision AS cc_base,
    state."scoring_policy_version"
  FROM "user_skill_state" AS state
  JOIN "user_credentials" AS credentials ON credentials."user_id" = state."user_id"
  WHERE credentials."email" = 'hocsinh.demo@mrtee.vn'
), ranked AS (
  SELECT
    solves."user_id",
    solves."rating_snapshot"::double precision AS rating,
    row_number() OVER (
      PARTITION BY solves."user_id"
      ORDER BY solves."rating_snapshot" DESC, solves."problem_key"
    ) AS position
  FROM "user_problem_solves" AS solves
  JOIN target ON target."user_id" = solves."user_id"
  WHERE solves."rating_snapshot" IS NOT NULL
), aggregates AS (
  SELECT
    target."user_id",
    target.cc_base,
    policy."version",
    COALESCE(
      sum(
        ranked.rating * power(policy."level_decay"::double precision, ranked.position - 1)
      ) / policy."level_denominator"::double precision,
      0
    ) AS calculated,
    COALESCE(
      sum(
        least(
          2::double precision,
          greatest(
            0.25::double precision,
            power(
              2::double precision,
              (ranked.rating - target.cc_base)
                / policy."level_mastery_rating_step"::double precision
            )
          )
        )
      ),
      0
    ) AS evidence,
    policy."level_mastery_factor"::double precision AS mastery_factor,
    policy."level_mastery_scale"::double precision AS mastery_scale
  FROM target
  JOIN "scoring_policies" AS policy
    ON policy."version" = target."scoring_policy_version"
  LEFT JOIN ranked ON ranked."user_id" = target."user_id"
  GROUP BY
    target."user_id", target.cc_base, policy."version", policy."level_denominator",
    policy."level_mastery_factor", policy."level_mastery_scale"
), recomputed AS (
  SELECT
    aggregates.*,
    aggregates.mastery_factor * ln(1 + aggregates.evidence / aggregates.mastery_scale)
      AS mastery_bonus
  FROM aggregates
)
UPDATE "user_skill_state" AS state
SET
  "cc_calculated" = round(recomputed.calculated::numeric, 2),
  "cc_mastery_bonus" = round(recomputed.mastery_bonus::numeric, 2),
  "cc_level" = round(
    (greatest(recomputed.cc_base, recomputed.calculated) + recomputed.mastery_bonus)::numeric,
    2
  ),
  "updated_at" = now()
FROM recomputed
WHERE state."user_id" = recomputed."user_id";--> statement-breakpoint
INSERT INTO "audit_logs" ("action", "entity_type", "entity_id", "after", "reason")
SELECT
  'DEMO_DATA_UTF8_AND_LEVEL_REPAIRED',
  'USER',
  users."id"::text,
  jsonb_build_object(
    'email', credentials."email",
    'ccBase', state."cc_base",
    'ccCalculated', state."cc_calculated",
    'ccMasteryBonus', state."cc_mastery_bonus",
    'ccLevel', state."cc_level",
    'scoringPolicyVersion', state."scoring_policy_version"
  ),
  'Sửa tên bài demo tiếng Việt và tính lại CC Level Học Sinh Demo theo policy hiện hành'
FROM "user_credentials" AS credentials
JOIN "users" AS users ON users."id" = credentials."user_id"
LEFT JOIN "user_skill_state" AS state ON state."user_id" = users."id"
WHERE credentials."email" IN ('admin@mrtee.vn', 'hocsinh.demo@mrtee.vn');
