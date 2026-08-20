CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"tier" varchar(30) NOT NULL,
	"color" varchar(20) NOT NULL,
	"required_longest_streak" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_tier_check" CHECK ("achievements"."tier" IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'LEGEND')),
	CONSTRAINT "achievements_streak_check" CHECK ("achievements"."required_longest_streak" > 0),
	CONSTRAINT "achievements_color_check" CHECK ("achievements"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"reward_order_id" uuid,
	"granted_by" uuid,
	"note" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_source_check" CHECK ("user_achievements"."source" IN ('MANUAL', 'REWARD')),
	CONSTRAINT "user_achievements_reward_link_check" CHECK (("user_achievements"."source" = 'REWARD') = ("user_achievements"."reward_order_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_category_check";--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "achievement_id" uuid;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_reward_order_id_reward_orders_id_fk" FOREIGN KEY ("reward_order_id") REFERENCES "public"."reward_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_streak_unique" ON "achievements" USING btree ("required_longest_streak");--> statement-breakpoint
CREATE INDEX "achievements_active_streak_idx" ON "achievements" USING btree ("active","required_longest_streak");--> statement-breakpoint
INSERT INTO "achievements" ("name", "description", "icon", "tier", "color", "required_longest_streak") VALUES
  ('Khởi động bền bỉ', 'Duy trì chuỗi luyện tập dài nhất 3 ngày.', '🌱', 'BRONZE', '#b7791f', 3),
  ('Ngọn lửa kiên trì', 'Duy trì chuỗi luyện tập dài nhất 7 ngày.', '🔥', 'SILVER', '#64748b', 7),
  ('Chiến binh kỷ luật', 'Duy trì chuỗi luyện tập dài nhất 14 ngày.', '⚔️', 'GOLD', '#d97706', 14),
  ('Bậc thầy bền bỉ', 'Duy trì chuỗi luyện tập dài nhất 30 ngày.', '💎', 'PLATINUM', '#0891b2', 30),
  ('Huyền thoại Streak', 'Duy trì chuỗi luyện tập dài nhất 60 ngày.', '👑', 'LEGEND', '#db2777', 60);--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_identity_unique" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_reward_order_unique" ON "user_achievements" USING btree ("reward_order_id") WHERE "user_achievements"."reward_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_achievements_user_granted_idx" ON "user_achievements" USING btree ("user_id","granted_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_achievement_link_check" CHECK (("rewards"."category" = 'ACHIEVEMENT') = ("rewards"."achievement_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_category_check" CHECK ("rewards"."category" IN ('STANDARD', 'MASCOT', 'ACHIEVEMENT'));
