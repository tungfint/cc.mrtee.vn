CREATE TYPE "public"."notification_audience" AS ENUM('ALL', 'USER', 'ORGANIZATION');--> statement-breakpoint
CREATE TABLE "notification_recipients" (
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_recipients_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"target_user_id" uuid,
	"target_organization_id" uuid,
	"ticker_text" varchar(300),
	"ticker_duration_minutes" integer DEFAULT 0 NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_audience_target_check" CHECK (("notifications"."audience" = 'ALL' AND "notifications"."target_user_id" IS NULL AND "notifications"."target_organization_id" IS NULL)
        OR ("notifications"."audience" = 'USER' AND "notifications"."target_user_id" IS NOT NULL AND "notifications"."target_organization_id" IS NULL)
        OR ("notifications"."audience" = 'ORGANIZATION' AND "notifications"."target_user_id" IS NULL AND "notifications"."target_organization_id" IS NOT NULL)),
	CONSTRAINT "notifications_ticker_duration_check" CHECK ("notifications"."ticker_duration_minutes" >= 0 AND "notifications"."ticker_duration_minutes" <= 10080)
);
--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_organization_id_organizations_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_recipients_user_read_idx" ON "notification_recipients" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_publish_active_idx" ON "notifications" USING btree ("active","publish_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_target_user_idx" ON "notifications" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "notifications_target_organization_idx" ON "notifications" USING btree ("target_organization_id");--> statement-breakpoint
