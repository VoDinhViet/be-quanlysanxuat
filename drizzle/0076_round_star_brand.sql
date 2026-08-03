ALTER TABLE "production_job_operations" DROP CONSTRAINT "production_job_operations_operation_id_operations_id_fk";
--> statement-breakpoint
ALTER TABLE "production_job_operations" ALTER COLUMN "production_job_bom_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ALTER COLUMN "operation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "type" "operation_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD CONSTRAINT "production_job_operations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;