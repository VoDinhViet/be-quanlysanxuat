ALTER TABLE "production_job_operations" ADD COLUMN "last_reported_at" timestamp;
--> statement-breakpoint
UPDATE "production_job_operations" AS o
SET "last_reported_at" = COALESCE(
  (SELECT max(r."created_at") FROM "production_job_operation_reports" r WHERE r."production_job_operation_id" = o."id"),
  o."completed_date"::timestamp
)
WHERE o."completed_date" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "production_job_operation_reports" r WHERE r."production_job_operation_id" = o."id");
