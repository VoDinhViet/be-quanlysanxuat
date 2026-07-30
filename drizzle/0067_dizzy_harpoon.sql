CREATE TYPE "public"."production_job_log_action" AS ENUM('STARTED', 'REPORTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."production_job_status" AS ENUM('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "production_job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"action" "production_job_log_action" NOT NULL,
	"content" varchar(1000) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "status" "production_job_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "produced_qty" numeric(18, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "rejected_qty" numeric(18, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "started_by" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "completed_by" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "cancel_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "production_job_logs" ADD CONSTRAINT "production_job_logs_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_logs" ADD CONSTRAINT "production_job_logs_performed_by_credentials_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_logs_job_id" ON "production_job_logs" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_started_by_credentials_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_completed_by_credentials_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_cancelled_by_credentials_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_jobs_status" ON "production_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_report_qty" CHECK (produced_qty >= 0 AND rejected_qty >= 0 AND produced_qty + rejected_qty <= quantity);--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_status_fields" CHECK ((status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
          OR (status = 'IN_PROGRESS')
          OR (status = 'PAUSED')
          OR (status = 'COMPLETED' AND completed_at IS NOT NULL)
          OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL));