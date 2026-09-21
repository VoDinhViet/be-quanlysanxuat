CREATE TYPE "public"."production_job_log_action" AS ENUM('CREATED', 'STARTED', 'WAITING_QC', 'WAITING_DELIVERY', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "production_job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_id" uuid NOT NULL,
	"action" "production_job_log_action" NOT NULL,
	"content" varchar(1000) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_job_logs" ADD CONSTRAINT "production_job_logs_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_logs" ADD CONSTRAINT "production_job_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_logs_production_job_id" ON "production_job_logs" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_logs_performed_by" ON "production_job_logs" USING btree ("performed_by");