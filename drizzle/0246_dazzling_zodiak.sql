-- Deploy chạy migration lúc app cũ còn sống: giới hạn thời gian chờ khoá để việc thêm cột không làm
-- tắc ghi `files`.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "draft_expires_at" timestamp;