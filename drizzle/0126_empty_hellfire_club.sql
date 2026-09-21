ALTER TABLE "oqc_inspections" DROP CONSTRAINT "oqc_inspections_production_job_id_production_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "oqc_inspections" DROP CONSTRAINT "oqc_inspections_production_job_operation_id_production_job_operations_id_fk";
--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "production_job_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ALTER COLUMN "production_job_operation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" DROP COLUMN "operation_code";--> statement-breakpoint
ALTER TABLE "oqc_inspections" DROP COLUMN "operation_name";--> statement-breakpoint
ALTER TABLE "oqc_inspections" DROP COLUMN "part_code";--> statement-breakpoint
ALTER TABLE "oqc_inspections" DROP COLUMN "part_name";