ALTER TABLE "bom_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ALTER COLUMN "planned_quantity" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "production_job_issues" ALTER COLUMN "unit_qty" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "production_job_issues" ALTER COLUMN "required_qty" SET DATA TYPE numeric(18, 6);