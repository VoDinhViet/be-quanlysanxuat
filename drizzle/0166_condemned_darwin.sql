ALTER TABLE "supplier_returns" DROP CONSTRAINT "chk_supplier_returns_qc_kind";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP CONSTRAINT "fk_supplier_returns_iqc_id_qc_kind";
--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP CONSTRAINT "fk_supplier_returns_qc_inspection_id_qc_kind";
--> statement-breakpoint
DROP INDEX "idx_supplier_returns_iqc_id";--> statement-breakpoint
DROP INDEX "idx_supplier_returns_qc_inspection_id";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP COLUMN "iqc_id";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP COLUMN "qc_kind";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP COLUMN "qc_inspection_id";--> statement-breakpoint
ALTER TABLE "qc_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qc_inspections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qc_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "qc_requests" CASCADE;--> statement-breakpoint
DROP TABLE "qc_inspections" CASCADE;--> statement-breakpoint
DROP TABLE "qc_files" CASCADE;--> statement-breakpoint
DROP TYPE "public"."qc_disposition";--> statement-breakpoint
DROP TYPE "public"."qc_kind";--> statement-breakpoint
DROP TYPE "public"."qc_result";--> statement-breakpoint
DROP TYPE "public"."qc_status";--> statement-breakpoint
DROP TYPE "public"."qc_file_kind";
