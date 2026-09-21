ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_status_fields";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT "chk_production_jobs_status_fields";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "completed_by" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_jobs_completed_by" ON "production_jobs" USING btree ("completed_by");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_status_fields" CHECK ((status = 'PENDING' AND code IS NULL AND approved_at IS NULL)
          OR (status = 'APPROVED' AND code IS NOT NULL AND approved_at IS NOT NULL)
          OR (status = 'COMPLETED' AND code IS NOT NULL AND approved_at IS NOT NULL));--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_status_fields" CHECK ((status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL)
          OR (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'WAITING_QC' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'WAITING_DELIVERY' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL));