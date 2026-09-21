ALTER TYPE "public"."upload_type" ADD VALUE 'PRODUCTION_OPERATION_EVIDENCE';--> statement-breakpoint
CREATE TABLE "production_job_operation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_operation_id" uuid NOT NULL,
	"completed_quantity_delta" numeric(12, 3) NOT NULL,
	"rejected_quantity_delta" numeric(12, 3) DEFAULT 0 NOT NULL,
	"completed_date" date NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_production_job_operation_reports_completed_quantity_delta_non_negative" CHECK (completed_quantity_delta >= 0),
	CONSTRAINT "chk_production_job_operation_reports_rejected_quantity_delta_non_negative" CHECK (rejected_quantity_delta >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_job_operation_report_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_job_operation_reports" ADD CONSTRAINT "production_job_operation_reports_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_operation_reports" ADD CONSTRAINT "production_job_operation_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_operation_report_files" ADD CONSTRAINT "production_job_operation_report_files_report_id_production_job_operation_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."production_job_operation_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_operation_report_files" ADD CONSTRAINT "production_job_operation_report_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_operation_reports_production_job_operation_id" ON "production_job_operation_reports" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_operation_reports_created_by" ON "production_job_operation_reports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_production_job_operation_report_files_report_id" ON "production_job_operation_report_files" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_operation_report_files_file_id" ON "production_job_operation_report_files" USING btree ("file_id");