ALTER TABLE "production_job_operations" ADD COLUMN IF NOT EXISTS "last_reported_at" timestamp;
--> statement-breakpoint
-- Dọn phần leadtime từng có ở bản migration nháp (đã bỏ tính năng) — DB chưa từng áp bản nháp thì bỏ qua.
DROP TABLE IF EXISTS "production_job_lead_times";
--> statement-breakpoint
ALTER TABLE "production_job_operations" DROP COLUMN IF EXISTS "lead_time_days";
--> statement-breakpoint
UPDATE "production_job_operations" AS o
SET "last_reported_at" = COALESCE(
  (SELECT max(r."created_at") FROM "production_job_operation_reports" r WHERE r."production_job_operation_id" = o."id"),
  o."completed_date"::timestamp
)
WHERE o."last_reported_at" IS NULL
  AND (
    o."completed_date" IS NOT NULL
    OR EXISTS (SELECT 1 FROM "production_job_operation_reports" r WHERE r."production_job_operation_id" = o."id")
  );
