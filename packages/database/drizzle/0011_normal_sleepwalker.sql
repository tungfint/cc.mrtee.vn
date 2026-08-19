CREATE TABLE "streak_rescues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_order_id" uuid NOT NULL,
	"rescued_date" date NOT NULL,
	"sacrificed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "streak_rescues" ADD CONSTRAINT "streak_rescues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_rescues" ADD CONSTRAINT "streak_rescues_reward_order_id_reward_orders_id_fk" FOREIGN KEY ("reward_order_id") REFERENCES "public"."reward_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "streak_rescues_reward_order_unique" ON "streak_rescues" USING btree ("reward_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "streak_rescues_user_date_unique" ON "streak_rescues" USING btree ("user_id","rescued_date");--> statement-breakpoint
CREATE INDEX "streak_rescues_user_date_idx" ON "streak_rescues" USING btree ("user_id","rescued_date" DESC NULLS LAST);
--> statement-breakpoint
UPDATE "motivational_quotes"
SET "author" = 'Cầy Cốt MrTee.VN', "updated_at" = now()
WHERE "author" = 'Cầy Code MrTee.vn';
