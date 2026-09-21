ALTER TABLE "iqc_inspections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oqc_inspections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iqc_attachments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- `DROP TABLE ... CASCADE` tự xoá luôn FK `supplier_returns_iqc_id_iqc_inspections_id_fk` (constraint
-- ở BẢNG KHÁC trỏ vào `iqc_inspections`) — drizzle-kit tự sinh thêm một `DROP CONSTRAINT` tường
-- minh cho đúng FK đó ngay sau, sẽ lỗi "does not exist" vì CASCADE ở trên đã xoá rồi; bỏ dòng đó.
DROP TABLE "iqc_inspections" CASCADE;--> statement-breakpoint
DROP TABLE "oqc_inspections" CASCADE;--> statement-breakpoint
DROP TABLE "iqc_attachments" CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "qc_kind" "qc_kind" DEFAULT 'INCOMING';--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "fk_supplier_returns_iqc_id_qc_kind" FOREIGN KEY ("iqc_id","qc_kind") REFERENCES "public"."quality_inspections"("id","kind") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "chk_supplier_returns_qc_kind" CHECK (qc_kind IS NULL OR qc_kind = 'INCOMING');--> statement-breakpoint
DROP TYPE "public"."iqc_disposition";--> statement-breakpoint
DROP TYPE "public"."iqc_inspection_level";--> statement-breakpoint
DROP TYPE "public"."iqc_result";--> statement-breakpoint
DROP TYPE "public"."iqc_status";--> statement-breakpoint
DROP TYPE "public"."oqc_disposition";--> statement-breakpoint
DROP TYPE "public"."oqc_status";