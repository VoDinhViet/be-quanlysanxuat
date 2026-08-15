CREATE TYPE "public"."iqc_attachment_kind" AS ENUM('QC_EVIDENCE', 'DISPOSITION_EVIDENCE');--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'EVIDENCE';--> statement-breakpoint
ALTER TYPE "public"."upload_type" ADD VALUE 'IQC_EVIDENCE';--> statement-breakpoint
ALTER TYPE "public"."upload_type" ADD VALUE 'IQC_DISPOSITION_EVIDENCE';--> statement-breakpoint
ALTER TYPE "public"."inventory_reference_type" ADD VALUE 'SUPPLIER_RETURN';--> statement-breakpoint
CREATE TABLE "iqc_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iqc_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "iqc_attachment_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "qc_department_id" uuid;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "result_note" varchar(500);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "disposition_note" varchar(500);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "sort_ok_qty" numeric(18, 3);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "sort_ng_qty" numeric(18, 3);--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "posted_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "iqc_attachments" ADD CONSTRAINT "iqc_attachments_iqc_id_iqc_inspections_id_fk" FOREIGN KEY ("iqc_id") REFERENCES "public"."iqc_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_attachments" ADD CONSTRAINT "iqc_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_iqc_attachments_iqc_id" ON "iqc_attachments" USING btree ("iqc_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_attachments_file_id" ON "iqc_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_attachments_iqc_id_kind" ON "iqc_attachments" USING btree ("iqc_id","kind");--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_qc_department_id_departments_id_fk" FOREIGN KEY ("qc_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_qc_department_id" ON "iqc_inspections" USING btree ("qc_department_id");--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_sort_qty_pair" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0));--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_sort_qty_requires_sort" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT');--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "chk_iqc_inspections_sort_qty_total" CHECK (sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity);