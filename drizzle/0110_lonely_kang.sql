CREATE TYPE "public"."oqc_status" AS ENUM('NOT_INSPECTED', 'PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "oqc_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"production_job_id" uuid,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"inspection_date" timestamp NOT NULL,
	"inspection_level" "iqc_inspection_level",
	"aql_level" numeric(4, 2),
	"sample_size" integer,
	"defect_qty" integer,
	"result" "iqc_result",
	"status" "oqc_status" DEFAULT 'NOT_INSPECTED' NOT NULL,
	"result_note" varchar(500),
	"note" varchar(1000),
	"confirmed_by" uuid,
	"confirmed_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oqc_inspections_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_oqc_inspections_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_oqc_inspections_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0),
	CONSTRAINT "chk_oqc_inspections_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0),
	CONSTRAINT "chk_oqc_inspections_aql_level_valid" CHECK (aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5]))
);
--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "production_job_id" uuid;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oqc_inspections" ADD CONSTRAINT "oqc_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_production_job_id" ON "oqc_inspections" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_item_id" ON "oqc_inspections" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_status" ON "oqc_inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_inspection_date" ON "oqc_inspections" USING btree ("inspection_date");--> statement-breakpoint
CREATE INDEX "idx_oqc_inspections_created_by" ON "oqc_inspections" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_production_job_id" ON "inventory_receipts" USING btree ("production_job_id");