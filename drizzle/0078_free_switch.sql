ALTER TABLE "production_job_operations" ADD COLUMN "completed_quantity" numeric(12, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "completed_date" date;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD CONSTRAINT "chk_production_job_operations_completed_quantity_non_negative" CHECK (completed_quantity >= 0);