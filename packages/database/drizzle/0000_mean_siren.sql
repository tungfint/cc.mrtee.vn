CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE TYPE "public"."account_sync_status" AS ENUM('UNVERIFIED', 'INITIALIZING', 'READY', 'QUEUED', 'SYNCING', 'ERROR', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('MEMBER', 'TEACHER', 'ORG_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'SUSPENDED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."organization_visibility" AS ENUM('PUBLIC', 'CLOSED', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."point_transaction_type" AS ENUM('EARN', 'BONUS', 'REDEEM', 'REFUND', 'PENALTY', 'REVERSAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."reward_order_status" AS ENUM('REQUESTED', 'APPROVED', 'FULFILLED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."season_award_type" AS ENUM('TOP_SCORE', 'MOST_IMPROVED', 'MOST_CONSISTENT', 'CHALLENGE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('DRAFT', 'ACTIVE', 'CLOSING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('USER', 'SYSTEM_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'TEACHER_VERIFIED', 'ADMIN_VERIFIED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cf_problems" (
	"problem_key" varchar(255) PRIMARY KEY NOT NULL,
	"contest_id" bigint,
	"problemset_name" varchar(200),
	"problem_index" varchar(20) NOT NULL,
	"name" varchar(300) NOT NULL,
	"type" varchar(50) NOT NULL,
	"current_rating" integer,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cf_problems_identity_check" CHECK ("cf_problems"."contest_id" IS NOT NULL OR "cf_problems"."problemset_name" IS NOT NULL),
	CONSTRAINT "cf_problems_rating_check" CHECK ("cf_problems"."current_rating" IS NULL OR "cf_problems"."current_rating" > 0)
);
--> statement-breakpoint
CREATE TABLE "cf_submissions" (
	"cf_submission_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_key" varchar(255) NOT NULL,
	"creation_time" timestamp with time zone NOT NULL,
	"verdict" varchar(50) NOT NULL,
	"participant_type" varchar(50),
	"is_team" boolean DEFAULT false NOT NULL,
	"programming_language" varchar(100),
	"problem_rating_observed" integer,
	"raw_metadata" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cf_submissions_identity_user_unique" UNIQUE("cf_submission_id","user_id"),
	CONSTRAINT "cf_submissions_identity_user_problem_unique" UNIQUE("cf_submission_id","user_id","problem_key")
);
--> statement-breakpoint
CREATE TABLE "codeforces_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" "citext" NOT NULL,
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"reward_eligible_from" timestamp with time zone,
	"last_seen_submission_id" bigint,
	"last_sync_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"sync_status" "account_sync_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codeforces_accounts_verification_timestamps_check" CHECK (("codeforces_accounts"."verification_status" = 'UNVERIFIED' AND "codeforces_accounts"."verified_at" IS NULL AND "codeforces_accounts"."reward_eligible_from" IS NULL) OR ("codeforces_accounts"."verification_status" <> 'UNVERIFIED' AND "codeforces_accounts"."verified_at" IS NOT NULL AND "codeforces_accounts"."reward_eligible_from" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'MEMBER' NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_left_at_check" CHECK (("organization_memberships"."status" = 'LEFT' AND "organization_memberships"."left_at" IS NOT NULL) OR ("organization_memberships"."status" <> 'LEFT' AND "organization_memberships"."left_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_organization_id" uuid,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"visibility" "organization_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"timezone" varchar(100) DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"status" "organization_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "point_transaction_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"season_id" uuid,
	"source_submission_id" bigint,
	"source_reward_order_id" uuid,
	"related_transaction_id" uuid,
	"idempotency_key" varchar(200),
	"affects_wallet" boolean DEFAULT true NOT NULL,
	"affects_season" boolean DEFAULT false NOT NULL,
	"cc_level_before" numeric(10, 2),
	"problem_rating_snapshot" integer,
	"scoring_policy_version" varchar(50),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_transactions_amount_check" CHECK ("point_transactions"."amount" <> 0),
	CONSTRAINT "point_transactions_earn_source_check" CHECK ("point_transactions"."type" <> 'EARN' OR ("point_transactions"."source_submission_id" IS NOT NULL AND "point_transactions"."scoring_policy_version" IS NOT NULL AND "point_transactions"."cc_level_before" IS NOT NULL AND "point_transactions"."problem_rating_snapshot" IS NOT NULL)),
	CONSTRAINT "point_transactions_correction_link_check" CHECK ("point_transactions"."type" NOT IN ('REVERSAL', 'REFUND') OR "point_transactions"."related_transaction_id" IS NOT NULL),
	CONSTRAINT "point_transactions_season_link_check" CHECK ("point_transactions"."affects_season" = false OR "point_transactions"."season_id" IS NOT NULL),
	CONSTRAINT "point_transactions_adjustment_idempotency_check" CHECK ("point_transactions"."type" <> 'ADJUSTMENT' OR "point_transactions"."idempotency_key" IS NOT NULL),
	CONSTRAINT "point_transactions_not_self_related_check" CHECK ("point_transactions"."related_transaction_id" IS NULL OR "point_transactions"."related_transaction_id" <> "point_transactions"."id")
);
--> statement-breakpoint
CREATE TABLE "reward_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"cost_snapshot" numeric(12, 2) NOT NULL,
	"status" "reward_order_status" DEFAULT 'REQUESTED' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"note" text,
	CONSTRAINT "reward_orders_identity_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "reward_orders_cost_snapshot_check" CHECK ("reward_orders"."cost_snapshot" > 0)
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"cost" numeric(12, 2) NOT NULL,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewards_cost_check" CHECK ("rewards"."cost" > 0),
	CONSTRAINT "rewards_stock_check" CHECK ("rewards"."stock" IS NULL OR "rewards"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scoring_policies" (
	"version" varchar(50) PRIMARY KEY NOT NULL,
	"level_decay" numeric(8, 7) NOT NULL,
	"level_denominator" numeric(10, 4) NOT NULL,
	"default_cc_base" numeric(10, 2) NOT NULL,
	"reward_min" numeric(12, 2) NOT NULL,
	"reward_max" numeric(12, 2) NOT NULL,
	"reward_midpoint_delta" numeric(10, 2) NOT NULL,
	"reward_scale" numeric(10, 2) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_policies_decay_check" CHECK ("scoring_policies"."level_decay" > 0 AND "scoring_policies"."level_decay" < 1),
	CONSTRAINT "scoring_policies_denominator_check" CHECK ("scoring_policies"."level_denominator" > 0),
	CONSTRAINT "scoring_policies_reward_bounds_check" CHECK ("scoring_policies"."reward_min" > 0 AND "scoring_policies"."reward_max" >= "scoring_policies"."reward_min"),
	CONSTRAINT "scoring_policies_reward_scale_check" CHECK ("scoring_policies"."reward_scale" > 0)
);
--> statement-breakpoint
CREATE TABLE "season_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"award_type" "season_award_type" NOT NULL,
	"rank" integer,
	"title" varchar(200) NOT NULL,
	"reward_description" text,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "season_awards_rank_check" CHECK ("season_awards"."rank" IS NULL OR "season_awards"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "season_user_snapshots" (
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cc_level_start" numeric(10, 2) NOT NULL,
	"cc_level_end" numeric(10, 2) NOT NULL,
	"cc_level_growth" numeric(10, 2) NOT NULL,
	"season_score" numeric(12, 2) NOT NULL,
	"qualifying_solves" integer NOT NULL,
	"active_days" integer NOT NULL,
	"longest_streak" integer NOT NULL,
	"max_challenge_delta" numeric(10, 2),
	"final_rank" integer,
	"closed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_user_snapshots_season_id_user_id_pk" PRIMARY KEY("season_id","user_id"),
	CONSTRAINT "season_user_snapshots_counts_check" CHECK ("season_user_snapshots"."qualifying_solves" >= 0 AND "season_user_snapshots"."active_days" >= 0 AND "season_user_snapshots"."longest_streak" >= 0),
	CONSTRAINT "season_user_snapshots_rank_check" CHECK ("season_user_snapshots"."final_rank" IS NULL OR "season_user_snapshots"."final_rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "season_user_totals" (
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"earned" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"bonus" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"penalty" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"score" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"qualifying_solves" integer DEFAULT 0 NOT NULL,
	"reached_score_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_user_totals_season_id_user_id_pk" PRIMARY KEY("season_id","user_id"),
	CONSTRAINT "season_user_totals_qualifying_solves_check" CHECK ("season_user_totals"."qualifying_solves" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" varchar(200) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "season_status" DEFAULT 'DRAFT' NOT NULL,
	"scoring_policy_version" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_time_range_check" CHECK ("seasons"."end_at" > "seasons"."start_at")
);
--> statement-breakpoint
CREATE TABLE "user_problem_solves" (
	"user_id" uuid NOT NULL,
	"problem_key" varchar(255) NOT NULL,
	"first_ok_submission_id" bigint NOT NULL,
	"first_solved_at" timestamp with time zone NOT NULL,
	"rating_snapshot" integer,
	"reward_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_problem_solves_user_id_problem_key_pk" PRIMARY KEY("user_id","problem_key")
);
--> statement-breakpoint
CREATE TABLE "user_skill_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"cc_base" numeric(10, 2) DEFAULT '800.00' NOT NULL,
	"cc_calculated" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"cc_level" numeric(10, 2) DEFAULT '800.00' NOT NULL,
	"scoring_policy_version" varchar(50) DEFAULT 'v2.0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"system_role" "system_role" DEFAULT 'USER' NOT NULL,
	"timezone" varchar(100) DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf_submissions" ADD CONSTRAINT "cf_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf_submissions" ADD CONSTRAINT "cf_submissions_problem_key_cf_problems_problem_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("problem_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD CONSTRAINT "codeforces_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD CONSTRAINT "codeforces_accounts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_organization_id_organizations_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_source_submission_fk" FOREIGN KEY ("source_submission_id","user_id") REFERENCES "public"."cf_submissions"("cf_submission_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_source_reward_order_fk" FOREIGN KEY ("source_reward_order_id","user_id") REFERENCES "public"."reward_orders"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_related_transaction_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "public"."point_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_tx_scoring_policy_fk" FOREIGN KEY ("scoring_policy_version") REFERENCES "public"."scoring_policies"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_policies" ADD CONSTRAINT "scoring_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_user_snapshots" ADD CONSTRAINT "season_user_snapshots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_user_snapshots" ADD CONSTRAINT "season_user_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_user_totals" ADD CONSTRAINT "season_user_totals_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_user_totals" ADD CONSTRAINT "season_user_totals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_scoring_policy_version_scoring_policies_version_fk" FOREIGN KEY ("scoring_policy_version") REFERENCES "public"."scoring_policies"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_problem_solves" ADD CONSTRAINT "user_problem_solves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_problem_solves" ADD CONSTRAINT "user_problem_solves_problem_key_cf_problems_problem_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("problem_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_problem_solves" ADD CONSTRAINT "user_problem_solves_first_submission_fk" FOREIGN KEY ("first_ok_submission_id","user_id","problem_key") REFERENCES "public"."cf_submissions"("cf_submission_id","user_id","problem_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_state" ADD CONSTRAINT "user_skill_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_state" ADD CONSTRAINT "user_skill_state_policy_fk" FOREIGN KEY ("scoring_policy_version") REFERENCES "public"."scoring_policies"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cf_problems_contest_identity_unique" ON "cf_problems" USING btree ("contest_id","problem_index") WHERE "cf_problems"."contest_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cf_problems_problemset_identity_unique" ON "cf_problems" USING btree ("problemset_name","problem_index") WHERE "cf_problems"."contest_id" IS NULL AND "cf_problems"."problemset_name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cf_submissions_user_creation_idx" ON "cf_submissions" USING btree ("user_id","creation_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cf_submissions_user_id_idx" ON "cf_submissions" USING btree ("user_id","cf_submission_id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "codeforces_accounts_user_unique" ON "codeforces_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "codeforces_accounts_handle_unique" ON "codeforces_accounts" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "codeforces_accounts_next_sync_idx" ON "codeforces_accounts" USING btree ("next_sync_at") WHERE "codeforces_accounts"."sync_status" NOT IN ('UNVERIFIED', 'INACTIVE');--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_one_active_unique" ON "organization_memberships" USING btree ("organization_id","user_id") WHERE "organization_memberships"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "organization_memberships_user_org_idx" ON "organization_memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_parent_idx" ON "organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_idempotency_key_unique" ON "point_transactions" USING btree ("idempotency_key") WHERE "point_transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_earn_submission_unique" ON "point_transactions" USING btree ("source_submission_id") WHERE "point_transactions"."type" = 'EARN';--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_reversal_target_unique" ON "point_transactions" USING btree ("related_transaction_id") WHERE "point_transactions"."type" = 'REVERSAL';--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_refund_target_unique" ON "point_transactions" USING btree ("related_transaction_id") WHERE "point_transactions"."type" = 'REFUND';--> statement-breakpoint
CREATE INDEX "point_transactions_user_created_idx" ON "point_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "point_transactions_season_user_created_idx" ON "point_transactions" USING btree ("season_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_orders_idempotency_key_unique" ON "reward_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "reward_orders_user_created_idx" ON "reward_orders" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rewards_active_idx" ON "rewards" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "season_awards_identity_unique" ON "season_awards" USING btree ("season_id","user_id","award_type","title");--> statement-breakpoint
CREATE INDEX "season_awards_season_type_idx" ON "season_awards" USING btree ("season_id","award_type");--> statement-breakpoint
CREATE INDEX "season_user_totals_leaderboard_idx" ON "season_user_totals" USING btree ("season_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "seasons_organization_time_idx" ON "seasons" USING btree ("organization_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "user_problem_solves_user_time_idx" ON "user_problem_solves" USING btree ("user_id","first_solved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
INSERT INTO "scoring_policies" (
	"version",
	"level_decay",
	"level_denominator",
	"default_cc_base",
	"reward_min",
	"reward_max",
	"reward_midpoint_delta",
	"reward_scale",
	"effective_from"
) VALUES (
	'v2.0',
	0.95,
	20,
	800,
	0.05,
	30.00,
	50,
	80,
	'2026-08-18T00:00:00+07:00'
) ON CONFLICT ("version") DO NOTHING;
