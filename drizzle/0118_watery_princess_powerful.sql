CREATE TYPE "public"."oqc_disposition" AS ENUM('ACCEPT', 'REWORK', 'SCRAP');--> statement-breakpoint
ALTER TYPE "public"."oqc_status" ADD VALUE 'REWORK' BEFORE 'COMPLETED';--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "production_job_operation_id" uuid;--> statement-breakpoint
-- Backfill: dữ liệu cũ (trước đợt đổi OQC sang gắn theo công đoạn) không suy được operation/part
-- thật — 4 cột snapshot dưới đây thêm nullable trước, gắn placeholder cho dòng cũ, rồi mới khoá
-- NOT NULL. `production_job_operation_id` cố ý để NULL cho dòng cũ (không suy được).
ALTER TABLE "oqc_inspections" ADD COLUMN "operation_code" varchar(50);--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "operation_name" varchar(255);--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "part_code" varchar(50);--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "part_name" varchar(255);--> statement-breakpoint
UPDATE "oqc_inspections" SET
  "operation_code" = '(dữ liệu cũ)',
  "operation_name" = '(dữ liệu cũ)',
  "part_code" = '(dữ liệu cũ)',
  "part_name" = '(dữ liệu cũ)'
WHERE "operation_code" IS NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "operation_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "operation_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "part_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "part_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "result_auto" "iqc_result";--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "disposition" "oqc_disposition";--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "disposition_note" varchar(500);--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_production_job_operation_id" ON "oqc_inspections" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_disposition" ON "oqc_inspections" USING btree ("disposition");--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "chk_oqc_inspections_disposition_requires_fail" CHECK (disposition IS NULL OR result = 'FAIL');