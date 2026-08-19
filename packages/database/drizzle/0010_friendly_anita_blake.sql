ALTER TABLE "rewards" ADD COLUMN "category" varchar(20) DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "required_cc_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_category_check" CHECK ("rewards"."category" IN ('STANDARD', 'MASCOT'));--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_required_cc_level_check" CHECK ("rewards"."required_cc_level" >= 0);
--> statement-breakpoint
INSERT INTO "rewards" (
  "id", "name", "description", "cost", "stock", "active", "image_url",
  "cash_value_vnd", "category", "required_cc_level"
) VALUES
  ('c0de0001-0000-4000-8000-000000000001', 'Mèo Mầm Code',
    'Bạn đồng hành khởi đầu, luôn sẵn sàng cùng bạn viết dòng code đầu tiên.',
    30, NULL, true, '/mascots/meo-mam-code.webp', NULL, 'MASCOT', 800),
  ('c0de0002-0000-4000-8000-000000000002', 'Cáo Hồng Tân Binh',
    'Cáo nhỏ nhanh nhẹn với bàn phím phát sáng dành cho người luyện tập đều đặn.',
    80, NULL, true, '/mascots/cao-hong-tan-binh.webp', NULL, 'MASCOT', 1000),
  ('c0de0003-0000-4000-8000-000000000003', 'Thỏ Kiếm Sĩ Thuật Toán',
    'Kiếm sĩ chibi chinh phục từng thuật toán bằng sự tập trung và lòng can đảm.',
    160, NULL, true, '/mascots/tho-kiem-si-thuat-toan.webp', NULL, 'MASCOT', 1200),
  ('c0de0004-0000-4000-8000-000000000004', 'Gấu Trúc Debug',
    'Chuyên gia tìm bug bằng kính lúp, bình tĩnh trước mọi test case khó.',
    300, NULL, true, '/mascots/gau-truc-debug.webp', NULL, 'MASCOT', 1400),
  ('c0de0005-0000-4000-8000-000000000005', 'Rồng Con Thuật Toán',
    'Rồng nhỏ điều khiển các nút thuật toán, biểu tượng của tư duy vững vàng.',
    550, NULL, true, '/mascots/rong-con-thuat-toan.webp', NULL, 'MASCOT', 1600),
  ('c0de0006-0000-4000-8000-000000000006', 'Phượng Hoàng Code Master',
    'Linh vật hiếm tỏa sáng dành cho hành trình bền bỉ và những cột mốc xuất sắc.',
    1000, NULL, true, '/mascots/phuong-hoang-code-master.webp', NULL, 'MASCOT', 1900);
