-- Keep local/staging databases that applied the first v3.0 draft aligned with
-- the final four-decimal CC Level precision. Repeating the TYPE is harmless on
-- a fresh installation where 0018 already created this shape.
ALTER TABLE "user_skill_state" ALTER COLUMN "cc_calculated" TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "user_skill_state" ALTER COLUMN "cc_level" TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "point_transactions" ALTER COLUMN "cc_level_before" TYPE numeric(12, 4);
