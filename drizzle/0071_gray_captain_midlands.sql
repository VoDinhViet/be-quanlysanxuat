ALTER TABLE "production_jobs" DROP CONSTRAINT "chk_production_jobs_report_qty";--> statement-breakpoint
-- `chk_production_jobs_status_fields` phải drop trước khi đổi kiểu cột `status` — Postgres re-bind
-- CHECK constraint theo kiểu cột mới giữa chừng ALTER, và constraint cũ trói cứng vào kiểu enum cũ
-- (`operator does not exist: text <> production_job_status`). Recreate lại y nguyên bên dưới sau
-- khi cột đã về đúng kiểu enum mới.
ALTER TABLE "production_jobs" DROP CONSTRAINT "chk_production_jobs_status_fields";--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
-- Data migration: remap dữ liệu cũ trước khi cast lại sang enum mới không còn giá trị WAITING
-- (bỏ luồng dừng/tạm chờ) — nếu không remap, dòng nào đang WAITING sẽ làm cast bên dưới lỗi.
UPDATE "production_jobs" SET "status" = 'IN_PROGRESS' WHERE "status" = 'WAITING';--> statement-breakpoint
DROP TYPE "public"."production_job_status";--> statement-breakpoint
CREATE TYPE "public"."production_job_status" AS ENUM('PENDING', 'IN_PROGRESS');--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."production_job_status";--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."production_job_status" USING "status"::"public"."production_job_status";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_status_fields" CHECK (status <> 'PENDING' OR started_at IS NULL);--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "produced_qty";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "rejected_qty";