ALTER TABLE "production_jobs" DROP CONSTRAINT "chk_production_jobs_status_fields";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT "production_jobs_completed_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT "production_jobs_cancelled_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_logs" ALTER COLUMN "action" SET DATA TYPE text;--> statement-breakpoint
UPDATE "production_job_logs" SET "action" = 'WAITING' WHERE "action" = 'PAUSED';--> statement-breakpoint
DROP TYPE "public"."production_job_log_action";--> statement-breakpoint
CREATE TYPE "public"."production_job_log_action" AS ENUM('STARTED', 'REPORTED', 'WAITING', 'RESUMED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "production_job_logs" ALTER COLUMN "action" SET DATA TYPE "public"."production_job_log_action" USING "action"::"public"."production_job_log_action";--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
UPDATE "production_jobs" SET "status" = 'WAITING' WHERE "status" IN ('PAUSED', 'COMPLETED');--> statement-breakpoint
UPDATE "production_jobs" SET "status" = 'PENDING', "started_by" = NULL, "started_at" = NULL WHERE "status" = 'CANCELLED';--> statement-breakpoint
DROP TYPE "public"."production_job_status";--> statement-breakpoint
CREATE TYPE "public"."production_job_status" AS ENUM('PENDING', 'IN_PROGRESS', 'WAITING');--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."production_job_status";--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."production_job_status" USING "status"::"public"."production_job_status";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "completed_by";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "completed_at";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "cancelled_by";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "cancelled_at";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "cancel_reason";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_status_fields" CHECK (status <> 'PENDING' OR started_at IS NULL);
