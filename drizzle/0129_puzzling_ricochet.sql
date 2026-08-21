CREATE TYPE "public"."qc_disposition" AS ENUM('CONCESSION', 'SORT', 'RETURN', 'ACCEPT', 'REWORK', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."qc_inspection_level" AS ENUM('I', 'II', 'III');--> statement-breakpoint
CREATE TYPE "public"."qc_kind" AS ENUM('INCOMING', 'OUTGOING');--> statement-breakpoint
CREATE TYPE "public"."qc_result" AS ENUM('PASS', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."qc_status" AS ENUM('NOT_INSPECTED', 'PENDING', 'WAITING_RETURN', 'REWORK', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"kind" "qc_kind" NOT NULL,
	"inventory_receipt_id" uuid,
	"outsourcing_receipt_id" uuid,
	"outsourcing_receipt_item_id" uuid,
	"purchase_order_id" uuid,
	"supplier_id" uuid,
	"production_job_id" uuid,
	"production_job_operation_id" uuid,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"inspection_date" timestamp NOT NULL,
	"inspection_level" "qc_inspection_level",
	"aql_level" numeric(4, 2),
	"sample_size" integer,
	"defect_qty" integer,
	"result" "qc_result",
	"result_auto" "qc_result",
	"disposition" "qc_disposition",
	"status" "qc_status" DEFAULT 'NOT_INSPECTED' NOT NULL,
	"reason" varchar(255),
	"note" varchar(1000),
	"result_note" varchar(500),
	"disposition_note" varchar(500),
	"inspection_standard" varchar(100),
	"inspector_name" varchar(100),
	"measuring_tools" varchar(255),
	"confirmed_by" uuid,
	"confirmed_at" timestamp,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"qc_department_id" uuid,
	"sort_ok_qty" numeric(18, 3),
	"sort_ng_qty" numeric(18, 3),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quality_inspections_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_quality_inspections_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_quality_inspections_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0),
	CONSTRAINT "chk_quality_inspections_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0),
	CONSTRAINT "chk_quality_inspections_aql_level_valid" CHECK (aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5])),
	CONSTRAINT "chk_quality_inspections_disposition_requires_fail" CHECK (disposition IS NULL OR result = 'FAIL'),
	CONSTRAINT "chk_quality_inspections_sort_qty_pair" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)),
	CONSTRAINT "chk_quality_inspections_sort_qty_requires_sort" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'),
	CONSTRAINT "chk_quality_inspections_sort_qty_total" CHECK (sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity),
	CONSTRAINT "chk_quality_inspections_source_exclusive" CHECK (NOT (inventory_receipt_id IS NOT NULL AND outsourcing_receipt_id IS NOT NULL)),
	CONSTRAINT "chk_quality_inspections_outsourcing_item" CHECK (outsourcing_receipt_item_id IS NULL OR outsourcing_receipt_id IS NOT NULL),
	CONSTRAINT "chk_quality_inspections_incoming_supplier" CHECK (kind <> 'INCOMING' OR supplier_id IS NOT NULL),
	CONSTRAINT "chk_quality_inspections_outgoing_no_supplier" CHECK (kind <> 'OUTGOING' OR supplier_id IS NULL),
	CONSTRAINT "chk_quality_inspections_outgoing_job" CHECK (kind <> 'OUTGOING' OR (production_job_id IS NOT NULL AND production_job_operation_id IS NOT NULL)),
	CONSTRAINT "chk_quality_inspections_status_by_kind" CHECK ((kind = 'INCOMING' AND status IN ('NOT_INSPECTED','PENDING','WAITING_RETURN','COMPLETED'))
          OR (kind = 'OUTGOING' AND status IN ('NOT_INSPECTED','PENDING','REWORK','COMPLETED'))),
	CONSTRAINT "chk_quality_inspections_disposition_by_kind" CHECK (disposition IS NULL
          OR (kind = 'INCOMING' AND disposition IN ('CONCESSION','SORT','RETURN'))
          OR (kind = 'OUTGOING' AND disposition IN ('ACCEPT','REWORK','SCRAP')))
);
--> statement-breakpoint
CREATE TABLE "qc_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "iqc_attachment_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- IF EXISTS/DROP-rồi-ADD (hand-added, xem .claude/rules/database.md): các constraint/index
-- production_job_bom_items + supplier_returns dưới đây đã được migrate thẳng lên dev qua một
-- migration khác không còn file cục bộ (không phải squash lịch sử — `db:check-drift` không thấy
-- do những migration đó không khớp `when` nào trong journal hiện tại). DROP-rồi-ADD lại đảm bảo hội
-- tụ đúng definition hiện hành dù DB xuất phát từ trạng thái nào (chưa có / có tên cũ / đã có tên
-- mới nhưng định nghĩa lệch — riêng `chk_supplier_returns_warehouse_required` đã bị lệch thật:
-- dev có bản cũ chỉ cấm cả hai cùng NULL, không phải XOR).
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT IF EXISTS "chk_production_job_bom_items_item_type_leaf";--> statement-breakpoint
ALTER TABLE "supplier_returns" ALTER COLUMN "warehouse_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inventory_receipt_id_inventory_receipts_id_fk" FOREIGN KEY ("inventory_receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_outsourcing_receipt_id_outsourcing_receipts_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_outsourcing_receipt_item_id_outsourcing_receipt_items_id_fk" FOREIGN KEY ("outsourcing_receipt_item_id") REFERENCES "public"."outsourcing_receipt_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_qc_department_id_departments_id_fk" FOREIGN KEY ("qc_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_attachments" ADD CONSTRAINT "qc_attachments_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_attachments" ADD CONSTRAINT "qc_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_inventory_receipt_id" ON "quality_inspections" USING btree ("inventory_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_outsourcing_receipt_id" ON "quality_inspections" USING btree ("outsourcing_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_outsourcing_receipt_item_id" ON "quality_inspections" USING btree ("outsourcing_receipt_item_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_purchase_order_id" ON "quality_inspections" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_supplier_id" ON "quality_inspections" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_production_job_id" ON "quality_inspections" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_production_job_operation_id" ON "quality_inspections" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_item_id" ON "quality_inspections" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_kind" ON "quality_inspections" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_status" ON "quality_inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_result" ON "quality_inspections" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_disposition" ON "quality_inspections" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_inspection_date" ON "quality_inspections" USING btree ("inspection_date");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_created_by" ON "quality_inspections" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_qc_department_id" ON "quality_inspections" USING btree ("qc_department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_inspections_id_kind" ON "quality_inspections" USING btree ("id","kind");--> statement-breakpoint
CREATE INDEX "idx_qc_attachments_file_id" ON "qc_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_qc_attachments_inspection_id_kind" ON "qc_attachments" USING btree ("inspection_id","kind");--> statement-breakpoint
DROP INDEX IF EXISTS "uq_production_job_bom_items_final_assembly";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_production_job_bom_items_final_assembly" ON "production_job_bom_items" USING btree ("production_job_id") WHERE item_type = 'FG';--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP CONSTRAINT IF EXISTS "chk_supplier_returns_warehouse_required";--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "chk_supplier_returns_warehouse_required" CHECK ((warehouse_id IS NULL) = (outsourcing_receipt_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT IF EXISTS "chk_production_job_bom_items_item_type";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "chk_production_job_bom_items_item_type" CHECK (item_type IN ('FG', 'WIP', 'RM'));--> statement-breakpoint
-- Data migration (hand-added, xem .claude/rules/database.md): copy dữ liệu từ iqc_inspections/
-- oqc_inspections cũ sang quality_inspections gộp — giữ nguyên id (supplier_returns.iqc_id,
-- qc_attachments.inspection_id không phải remap; `code` hai bảng khác prefix IQC-*/OQC-* nên
-- không đụng UNIQUE mới). Bỏ phiếu OQC gắn công đoạn `type = OUTSOURCE` (đã chốt: công đoạn gia
-- công ngoài chỉ QC bằng nhánh IQC, không phải OQC — docs/decisions/qc-single-table.md).
INSERT INTO quality_inspections (
  id, code, kind, inventory_receipt_id, outsourcing_receipt_id, purchase_order_id, supplier_id,
  item_id, quantity, inspection_date, inspection_level, aql_level, sample_size, defect_qty,
  result, disposition, status, reason, note, result_note, disposition_note, inspection_standard,
  inspector_name, measuring_tools, confirmed_by, confirmed_at, resolved_by, resolved_at,
  qc_department_id, sort_ok_qty, sort_ng_qty, created_by, created_at, updated_at
)
SELECT
  id, code, 'INCOMING', inventory_receipt_id, outsourcing_receipt_id, purchase_order_id,
  supplier_id, item_id, quantity, inspection_date, inspection_level::text::qc_inspection_level,
  aql_level, sample_size, defect_qty, result::text::qc_result, disposition::text::qc_disposition,
  status::text::qc_status, reason, note, result_note, disposition_note, inspection_standard,
  inspector_name, measuring_tools, confirmed_by, confirmed_at, resolved_by, resolved_at,
  qc_department_id, sort_ok_qty, sort_ng_qty, created_by, created_at, updated_at
FROM iqc_inspections;--> statement-breakpoint
INSERT INTO quality_inspections (
  id, code, kind, production_job_id, production_job_operation_id, item_id, quantity,
  inspection_date, inspection_level, aql_level, sample_size, defect_qty, result, result_auto,
  disposition, status, result_note, disposition_note, note, confirmed_by, confirmed_at,
  resolved_by, resolved_at, created_by, created_at, updated_at
)
SELECT
  o.id, o.code, 'OUTGOING', o.production_job_id, o.production_job_operation_id, o.item_id,
  o.quantity, o.inspection_date, o.inspection_level::text::qc_inspection_level, o.aql_level,
  o.sample_size, o.defect_qty, o.result::text::qc_result, o.result_auto::text::qc_result,
  o.disposition::text::qc_disposition, o.status::text::qc_status, o.result_note,
  o.disposition_note, o.note, o.confirmed_by, o.confirmed_at, o.resolved_by, o.resolved_at,
  o.created_by, o.created_at, o.updated_at
FROM oqc_inspections o
INNER JOIN production_job_operations pjo ON pjo.id = o.production_job_operation_id
WHERE pjo.type <> 'OUTSOURCE';--> statement-breakpoint
-- Backfill neo công đoạn cho IQC sinh từ OS-IN (`outsourcing_receipt_item_id`/`production_job_id`/
-- `production_job_operation_id`) — match theo (outsourcing_receipt_id, item_id) CHỈ khi đúng 1 dòng
-- OS-IN khớp (HAVING count(*) = 1); mơ hồ (0 hoặc nhiều dòng khớp) để NULL, không đoán — join mờ
-- cũ (`getJobOutsourcingIqcClearance`) chính là lỗ hổng bị thay bằng cột neo này.
UPDATE quality_inspections qi
SET
  outsourcing_receipt_item_id = m.receipt_item_id,
  production_job_id = m.production_job_id,
  production_job_operation_id = m.production_job_operation_id
FROM (
  SELECT
    ori.outsourcing_receipt_id,
    ori.item_id,
    MIN(ori.id::text)::uuid AS receipt_item_id,
    MIN(ooi.production_job_id::text)::uuid AS production_job_id,
    MIN(ooi.production_job_operation_id::text)::uuid AS production_job_operation_id,
    COUNT(*) AS match_count
  FROM outsourcing_receipt_items ori
  INNER JOIN outsourcing_order_items ooi ON ooi.id = ori.outsourcing_order_item_id
  GROUP BY ori.outsourcing_receipt_id, ori.item_id
  HAVING COUNT(*) = 1
) m
WHERE qi.kind = 'INCOMING'
  AND qi.outsourcing_receipt_id = m.outsourcing_receipt_id
  AND qi.item_id = m.item_id;