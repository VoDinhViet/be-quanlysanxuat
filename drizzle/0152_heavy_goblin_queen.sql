ALTER TABLE "production_jobs" ADD COLUMN "operations_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "operations_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "rejected_quantity" numeric(12, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_operations_approved_by_users_id_fk" FOREIGN KEY ("operations_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_jobs_operations_approved_by" ON "production_jobs" USING btree ("operations_approved_by");--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD CONSTRAINT "chk_production_job_operations_rejected_quantity_non_negative" CHECK (rejected_quantity >= 0);