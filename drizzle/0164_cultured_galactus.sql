ALTER TABLE "supplier_returns" ADD COLUMN "quality_inspection_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "quality_inspection_result_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "qc_inspection_type" "quality_inspection_type";--> statement-breakpoint
-- Backfill 3 cột mới từ iqc_id/qc_inspection_id/qc_kind — id giữ nguyên giữa qc_requests/
-- qc_inspections và quality_inspections/quality_inspection_results nên copy thẳng, chỉ qc_kind cần
-- map giá trị (INCOMING->IQC, bảng này chỉ bao giờ INCOMING — chk_supplier_returns_qc_kind).
UPDATE "supplier_returns" SET
  "quality_inspection_id" = "iqc_id",
  "quality_inspection_result_id" = "qc_inspection_id",
  "qc_inspection_type" = CASE "qc_kind" WHEN 'INCOMING' THEN 'IQC' END::"quality_inspection_type"
WHERE "iqc_id" IS NOT NULL OR "qc_inspection_id" IS NOT NULL OR "qc_kind" IS NOT NULL;