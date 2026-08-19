CREATE TABLE "cc_level_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_level" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon" text NOT NULL,
	"color" varchar(20) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cc_level_ranks_min_level_check" CHECK ("cc_level_ranks"."min_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "motivational_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"author" varchar(160),
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motivational_quotes_sort_order_check" CHECK ("motivational_quotes"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cc_level_ranks_min_level_unique" ON "cc_level_ranks" USING btree ("min_level");--> statement-breakpoint
CREATE INDEX "cc_level_ranks_active_level_idx" ON "cc_level_ranks" USING btree ("active","min_level");--> statement-breakpoint
CREATE INDEX "motivational_quotes_active_order_idx" ON "motivational_quotes" USING btree ("active","sort_order");--> statement-breakpoint
INSERT INTO "motivational_quotes" ("content", "author", "sort_order") VALUES
  ('Mỗi bài toán bạn giải hôm nay là một bước tiến của chính bạn ngày mai.', 'Cầy Code MrTee.vn', 10),
  ('Đừng sợ bài khó; hãy chia nó thành những ý tưởng đủ nhỏ để bắt đầu.', 'Cầy Code MrTee.vn', 20),
  ('Kiên trì đều đặn quan trọng hơn một ngày học thật nhiều rồi dừng lại.', 'Cầy Code MrTee.vn', 30);--> statement-breakpoint
INSERT INTO "cc_level_ranks" ("min_level", "name", "icon", "color") VALUES
  (800, 'Đồng', '🥉', '#b87333'),
  (1000, 'Bạc', '🥈', '#94a3b8'),
  (1200, 'Vàng', '🥇', '#eab308'),
  (1400, 'Bạch Kim', '💠', '#22d3ee'),
  (1600, 'Kim Cương', '💎', '#3b82f6'),
  (1800, 'Tinh Anh', '🦅', '#a855f7'),
  (2000, 'Cao Thủ', '🏆', '#f97316'),
  (2200, 'Chiến Tướng', '👑', '#ef4444');
