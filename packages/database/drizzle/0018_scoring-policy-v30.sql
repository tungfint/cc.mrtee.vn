ALTER TABLE "scoring_policies"
  ADD COLUMN "level_initial" numeric(10, 2) DEFAULT '800' NOT NULL,
  ADD COLUMN "level_gain_max" numeric(10, 4) DEFAULT '4' NOT NULL,
  ADD COLUMN "level_gain_scale" numeric(10, 2) DEFAULT '100' NOT NULL,
  ADD COLUMN "max_positive_delta" numeric(10, 2) DEFAULT '500' NOT NULL;--> statement-breakpoint

ALTER TABLE "scoring_policies" ADD CONSTRAINT "scoring_policies_v3_level_check"
  CHECK (
    "level_initial" >= 0 AND "level_gain_max" > 0
    AND "level_gain_scale" > 0 AND "max_positive_delta" > 0
  );--> statement-breakpoint

ALTER TABLE "user_skill_state" ALTER COLUMN "cc_calculated" TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "user_skill_state" ALTER COLUMN "cc_level" TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "point_transactions" ALTER COLUMN "cc_level_before" TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "user_skill_state" ALTER COLUMN "scoring_policy_version" SET DEFAULT 'v3.0';--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN "activity_risk_score" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "activity_risk_level" varchar(20) DEFAULT 'NORMAL' NOT NULL,
  ADD COLUMN "activity_risk_reviewed_at" timestamptz,
  ADD COLUMN "activity_risk_reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_activity_risk_check"
  CHECK (
    "activity_risk_score" >= 0
    AND "activity_risk_level" IN ('NORMAL', 'REVIEW', 'PRIORITY')
  );--> statement-breakpoint

CREATE TABLE "activity_risk_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_submission_id" bigint REFERENCES "cf_submissions"("cf_submission_id") ON DELETE SET NULL,
  "signal_code" varchar(60) NOT NULL,
  "score" integer NOT NULL,
  "summary" varchar(300) NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotency_key" varchar(200) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "reviewed_at" timestamptz,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolution" varchar(30),
  "review_note" text,
  CONSTRAINT "activity_risk_events_idempotency_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "activity_risk_events_score_check" CHECK ("score" > 0),
  CONSTRAINT "activity_risk_events_resolution_check" CHECK (
    "resolution" IS NULL OR "resolution" IN ('VALID', 'MONITORING', 'VIOLATION')
  )
);--> statement-breakpoint

CREATE INDEX "activity_risk_events_user_created_idx"
  ON "activity_risk_events" ("user_id", "created_at" DESC);--> statement-breakpoint

INSERT INTO "scoring_policies" (
  "version", "level_decay", "level_denominator", "level_mastery_factor",
  "level_mastery_scale", "level_mastery_rating_step", "default_cc_base",
  "level_initial", "level_gain_max", "level_gain_scale", "max_positive_delta",
  "reward_min", "reward_max", "reward_midpoint_delta", "reward_scale", "effective_from"
) VALUES (
  'v3.0', 0.95, 20, 0, 4, 400, 800,
  800, 4, 100, 500,
  0.25, 12.50, 50, 120, now()
) ON CONFLICT ("version") DO NOTHING;--> statement-breakpoint

UPDATE "seasons"
SET "scoring_policy_version" = 'v3.0', "updated_at" = now()
WHERE "status" IN ('DRAFT', 'ACTIVE', 'CLOSING');--> statement-breakpoint

WITH RECURSIVE ordered AS (
  SELECT
    solves."user_id",
    solves."rating_snapshot"::double precision AS rating,
    row_number() OVER (
      PARTITION BY solves."user_id"
      ORDER BY solves."first_solved_at", solves."first_ok_submission_id", solves."problem_key"
    ) AS step
  FROM "user_problem_solves" AS solves
  WHERE solves."rating_snapshot" IS NOT NULL
), replay AS (
  SELECT state."user_id", 0::bigint AS step, 800::double precision AS level
  FROM "user_skill_state" AS state
  UNION ALL
  SELECT
    replay."user_id",
    ordered.step,
    replay.level + 4 / (
      1 + exp(-least(ordered.rating - replay.level, 500::double precision) / 100)
    ) AS level
  FROM replay
  JOIN ordered
    ON ordered."user_id" = replay."user_id" AND ordered.step = replay.step + 1
), final AS (
  SELECT DISTINCT ON ("user_id") "user_id", level
  FROM replay
  ORDER BY "user_id", step DESC
)
UPDATE "user_skill_state" AS state
SET
  "cc_base" = 800,
  "cc_calculated" = round(final.level::numeric, 4),
  "cc_mastery_bonus" = 0,
  "cc_level" = round(final.level::numeric, 4),
  "scoring_policy_version" = 'v3.0',
  "updated_at" = now()
FROM final
WHERE final."user_id" = state."user_id";--> statement-breakpoint

COMMENT ON COLUMN "user_skill_state"."cc_base" IS
  'Legacy compatibility only. Scoring v3.0 always starts replay at CCL 800 and does not use CC Base.';--> statement-breakpoint

INSERT INTO "audit_logs" ("action", "entity_type", "entity_id", "after", "reason")
VALUES (
  'SCORING_POLICY_V3_ACTIVATED', 'scoring_policy', 'v3.0',
  jsonb_build_object(
    'initialCcl', 800, 'levelGainMax', 4, 'levelGainScale', 100,
    'maxPositiveDelta', 500, 'rewardMin', 0.25, 'rewardMax', 12.5,
    'rewardMidpointDelta', 50, 'rewardScale', 120,
    'ccBaseRemovedFromBusinessRules', true
  ),
  'Kích hoạt công thức CCL/CCP v3.0; không giữ điểm khi có dấu hiệu bất thường'
);
