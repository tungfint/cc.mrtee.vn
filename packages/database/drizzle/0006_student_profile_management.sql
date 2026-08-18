ALTER TABLE "codeforces_accounts" ADD COLUMN "pending_handle" citext;
--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD COLUMN "current_rating" integer;
--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD COLUMN "max_rating" integer;
--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD COLUMN "rank" varchar(50);
--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD COLUMN "max_rank" varchar(50);
--> statement-breakpoint
CREATE UNIQUE INDEX "codeforces_accounts_pending_handle_unique"
ON "codeforces_accounts" USING btree ("pending_handle")
WHERE "codeforces_accounts"."pending_handle" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "codeforces_accounts" ADD CONSTRAINT "codeforces_accounts_rating_check"
CHECK (
  ("codeforces_accounts"."current_rating" IS NULL OR "codeforces_accounts"."current_rating" >= 0)
  AND ("codeforces_accounts"."max_rating" IS NULL OR "codeforces_accounts"."max_rating" >= 0)
);
