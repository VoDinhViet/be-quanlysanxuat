ALTER TYPE "public"."production_job_log_action" ADD VALUE 'ITEMS_EDITED';--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "snapshot_edited_at" timestamp;