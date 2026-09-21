CREATE TYPE "public"."iqc_inspection_level" AS ENUM('I', 'II', 'III');--> statement-breakpoint
ALTER TYPE "public"."iqc_status" ADD VALUE 'NOT_INSPECTED' BEFORE 'PENDING';--> statement-breakpoint
ALTER TABLE "iqc_inspections" ALTER COLUMN "result" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "inspection_level" "iqc_inspection_level";--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "aql_level" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "sample_size" integer;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "defect_qty" integer;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_aql_level_valid" CHECK (aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5]));