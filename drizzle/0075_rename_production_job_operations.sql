ALTER TABLE "production_job_steps" RENAME TO "production_job_operations";--> statement-breakpoint
ALTER TABLE "production_job_operations" RENAME CONSTRAINT "production_job_steps_pkey" TO "production_job_operations_pkey";--> statement-breakpoint
ALTER TABLE "production_job_operations" RENAME CONSTRAINT "production_job_steps_operation_id_operations_id_fk" TO "production_job_operations_operation_id_operations_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_operations" RENAME CONSTRAINT "production_job_steps_production_job_id_production_jobs_id_fk" TO "production_job_operations_production_job_id_production_jobs_id_";--> statement-breakpoint
ALTER TABLE "production_job_operations" RENAME CONSTRAINT "production_job_steps_production_job_bom_item_id_production_job_" TO "production_job_operations_production_job_bom_item_id_production";--> statement-breakpoint
ALTER INDEX "idx_production_job_steps_production_job_id" RENAME TO "idx_production_job_operations_production_job_id";--> statement-breakpoint
ALTER INDEX "idx_production_job_steps_production_job_bom_item_id" RENAME TO "idx_production_job_operations_production_job_bom_item_id";--> statement-breakpoint
ALTER INDEX "idx_production_job_steps_operation_id" RENAME TO "idx_production_job_operations_operation_id";
