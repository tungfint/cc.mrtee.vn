CREATE TABLE "user_level_rank_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"point_transaction_id" uuid,
	"achieved_level" numeric(12, 4) NOT NULL,
	"source" varchar(30) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_level_rank_awards_source_check" CHECK ("user_level_rank_awards"."source" IN ('SOLVE', 'RECALIBRATION', 'ADMIN'))
);
--> statement-breakpoint
ALTER TABLE "cc_level_ranks" ADD COLUMN "reward_point" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD COLUMN "affects_point" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "point_transactions" SET "affects_point" = false
WHERE "type" IN ('REDEEM', 'REFUND');--> statement-breakpoint
ALTER TABLE "reward_orders" ADD COLUMN "recipient_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reward_orders" ADD COLUMN "gift_message" text;--> statement-breakpoint
ALTER TABLE "user_level_rank_awards" ADD CONSTRAINT "user_level_rank_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_level_rank_awards" ADD CONSTRAINT "user_level_rank_awards_rank_id_cc_level_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."cc_level_ranks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_level_rank_awards" ADD CONSTRAINT "user_level_rank_awards_point_transaction_id_point_transactions_id_fk" FOREIGN KEY ("point_transaction_id") REFERENCES "public"."point_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_level_rank_awards_user_rank_unique" ON "user_level_rank_awards" USING btree ("user_id","rank_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_level_rank_awards_transaction_unique" ON "user_level_rank_awards" USING btree ("point_transaction_id") WHERE "user_level_rank_awards"."point_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_level_rank_awards_user_awarded_idx" ON "user_level_rank_awards" USING btree ("user_id","awarded_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_orders_recipient_created_idx" ON "reward_orders" USING btree ("recipient_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "cc_level_ranks" ADD CONSTRAINT "cc_level_ranks_reward_point_check" CHECK ("cc_level_ranks"."reward_point" >= 0);--> statement-breakpoint
ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_recipient_check" CHECK ("reward_orders"."recipient_user_id" IS NULL OR "reward_orders"."recipient_user_id" <> "reward_orders"."user_id");
