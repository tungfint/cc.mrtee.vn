CREATE TABLE "leaderboard_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"public_key" varchar(180) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "cash_value_vnd" integer;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leaderboard_share_links" ADD CONSTRAINT "leaderboard_share_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_share_links" ADD CONSTRAINT "leaderboard_share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_share_links_public_key_unique" ON "leaderboard_share_links" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "leaderboard_share_links_scope_idx" ON "leaderboard_share_links" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_cash_value_check" CHECK ("rewards"."cash_value_vnd" IS NULL OR "rewards"."cash_value_vnd" > 0);--> statement-breakpoint
INSERT INTO "rewards" ("name", "description", "cost", "stock", "active", "cash_value_vnd") VALUES
  ('Tiền thưởng 10.000đ', 'Quy đổi CC Balance thành tiền thưởng 10.000đ.', 120, NULL, true, 10000),
  ('Tiền thưởng 50.000đ', 'Quy đổi CC Balance thành tiền thưởng 50.000đ.', 550, NULL, true, 50000),
  ('Tiền thưởng 100.000đ', 'Quy đổi CC Balance thành tiền thưởng 100.000đ.', 1000, NULL, true, 100000),
  ('Tiền thưởng 300.000đ', 'Quy đổi CC Balance thành tiền thưởng 300.000đ.', 2600, NULL, true, 300000),
  ('Tiền thưởng 500.000đ', 'Quy đổi CC Balance thành tiền thưởng 500.000đ.', 4200, NULL, true, 500000),
  ('Tiền thưởng 1.000.000đ', 'Quy đổi CC Balance thành tiền thưởng 1.000.000đ.', 8000, NULL, true, 1000000);
