ALTER TYPE "public"."system_role" ADD VALUE 'ADMIN' BEFORE 'SYSTEM_ADMIN';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leaderboard_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "users" SET "leaderboard_visible" = false WHERE "system_role" = 'SYSTEM_ADMIN';
