-- Hand-authored (thay hoàn toàn bản `drizzle-kit generate` tự sinh trước đó — xem
-- .claude/rules/database.md, "MUST NOT hand-edit a generated migration except to add a data
-- migration"). Bản gốc bị `drizzle-kit generate` sinh sai: coi `quality_inspections` -> `qc_requests`
-- là DROP TABLE CASCADE + CREATE TABLE rỗng, không có backfill nào — nếu chạy trót lọt sẽ mất vĩnh
-- viễn toàn bộ dữ liệu IQC/OQC hiện có. May mắn một bug khác (DROP CONSTRAINT thừa cho 2 FK đã bị
-- CASCADE xoá sẵn) làm transaction rollback trước khi kịp DROP TABLE — xác nhận qua truy vấn trực
-- tiếp vào DB dev: quality_inspections vẫn còn nguyên 6 dòng, migration này chưa từng được ghi nhận
-- là đã áp dụng. Bản thay thế này dùng ALTER TABLE ... RENAME (giữ nguyên id/dữ liệu) + backfill
-- đầy đủ, không mất dòng nào.

-- ===== PHASE 1: quality_inspections -> qc_requests (RENAME, không DROP) =====
ALTER TABLE "quality_inspections" RENAME TO "qc_requests";--> statement-breakpoint

ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_pkey" TO "qc_requests_pkey";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_code_unique" TO "qc_requests_code_unique";--> statement-breakpoint

ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_quantity_positive" TO "chk_qc_requests_quantity_positive";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_sample_size_positive" TO "chk_qc_requests_sample_size_positive";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_defect_qty_non_negative" TO "chk_qc_requests_defect_qty_non_negative";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_disposition_requires_fail" TO "chk_qc_requests_disposition_requires_fail";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_sort_qty_pair" TO "chk_qc_requests_sort_qty_pair";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_sort_qty_requires_sort" TO "chk_qc_requests_sort_qty_requires_sort";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_sort_qty_total" TO "chk_qc_requests_sort_qty_total";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_source_exclusive" TO "chk_qc_requests_source_exclusive";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_outsourcing_item" TO "chk_qc_requests_outsourcing_item";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_incoming_supplier" TO "chk_qc_requests_incoming_supplier";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_outgoing_no_supplier" TO "chk_qc_requests_outgoing_no_supplier";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_outgoing_job" TO "chk_qc_requests_outgoing_job";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_status_by_kind" TO "chk_qc_requests_status_by_kind";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "chk_quality_inspections_disposition_by_kind" TO "chk_qc_requests_disposition_by_kind";--> statement-breakpoint

-- aql_level: định nghĩa CHECK đổi thật (Phase B AQL master data), không phải chỉ đổi tên — không
-- rename được, phải drop bản cũ rồi add bản mới. Xem docs/decisions/qc-aql-master-data.md.
ALTER TABLE "qc_requests" DROP CONSTRAINT "chk_quality_inspections_aql_level_valid";--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_aql_level_positive" CHECK (aql_level IS NULL OR aql_level > 0);--> statement-breakpoint

-- Cột mới (Phase A: tách qc_inspections làm bảng attempt) — 6 dòng hiện có coi như 0 attempt cho
-- tới khi backfill ở PHASE 3 set lại = 1 cho dòng đã có result.
ALTER TABLE "qc_requests" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_attempt_count_non_negative" CHECK (attempt_count >= 0);--> statement-breakpoint

-- 4 tên gốc dưới đây bị Postgres tự cắt còn 63 ký tự lúc tạo ở migration 0129 (NAMEDATALEN) — lấy
-- đúng tên thật qua truy vấn pg_constraint trên DB dev, không phải suy từ literal SQL gốc.
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_inventory_receipt_id_inventory_receipts_id_" TO "qc_requests_inventory_receipt_id_inventory_receipts_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_outsourcing_receipt_id_outsourcing_receipts" TO "qc_requests_outsourcing_receipt_id_outsourcing_receipts_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_outsourcing_receipt_item_id_outsourcing_rec" TO "qc_requests_outsourcing_receipt_item_id_outsourcing_receipt_items_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_purchase_order_id_purchase_orders_id_fk" TO "qc_requests_purchase_order_id_purchase_orders_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_supplier_id_suppliers_id_fk" TO "qc_requests_supplier_id_suppliers_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_production_job_id_production_jobs_id_fk" TO "qc_requests_production_job_id_production_jobs_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_production_job_operation_id_production_job_" TO "qc_requests_production_job_operation_id_production_job_operations_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_item_id_items_id_fk" TO "qc_requests_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_confirmed_by_users_id_fk" TO "qc_requests_confirmed_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_resolved_by_users_id_fk" TO "qc_requests_resolved_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_qc_department_id_departments_id_fk" TO "qc_requests_qc_department_id_departments_id_fk";--> statement-breakpoint
ALTER TABLE "qc_requests" RENAME CONSTRAINT "quality_inspections_created_by_users_id_fk" TO "qc_requests_created_by_users_id_fk";--> statement-breakpoint

ALTER INDEX "idx_quality_inspections_inventory_receipt_id" RENAME TO "idx_qc_requests_inventory_receipt_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_outsourcing_receipt_id" RENAME TO "idx_qc_requests_outsourcing_receipt_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_outsourcing_receipt_item_id" RENAME TO "idx_qc_requests_outsourcing_receipt_item_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_purchase_order_id" RENAME TO "idx_qc_requests_purchase_order_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_supplier_id" RENAME TO "idx_qc_requests_supplier_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_production_job_id" RENAME TO "idx_qc_requests_production_job_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_production_job_operation_id" RENAME TO "idx_qc_requests_production_job_operation_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_item_id" RENAME TO "idx_qc_requests_item_id";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_kind" RENAME TO "idx_qc_requests_kind";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_status" RENAME TO "idx_qc_requests_status";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_result" RENAME TO "idx_qc_requests_result";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_disposition" RENAME TO "idx_qc_requests_disposition";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_inspection_date" RENAME TO "idx_qc_requests_inspection_date";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_created_by" RENAME TO "idx_qc_requests_created_by";--> statement-breakpoint
ALTER INDEX "idx_quality_inspections_qc_department_id" RENAME TO "idx_qc_requests_qc_department_id";--> statement-breakpoint
ALTER INDEX "uq_quality_inspections_id_kind" RENAME TO "uq_qc_requests_id_kind";--> statement-breakpoint

-- Composite (id, kind, quantity) mới — cần cho FK 3 cột của qc_inspections ở PHASE 2, xem
-- doc-comment fk_qc_inspections_request trong qc-inspections.ts.
CREATE UNIQUE INDEX "uq_qc_requests_id_kind_quantity" ON "qc_requests" USING btree ("id","kind","quantity");--> statement-breakpoint

-- ===== PHASE 2: tạo bảng qc_inspections (bảng attempt, hoàn toàn mới) =====
CREATE TABLE "qc_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qc_request_id" uuid NOT NULL,
	"kind" "qc_kind" NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"attempt_no" integer NOT NULL,
	"inspection_date" timestamp NOT NULL,
	"inspection_level" "qc_inspection_level",
	"aql_level" numeric(4, 2),
	"aql_plan_id" uuid,
	"aql_rule_id" uuid,
	"code_letter" varchar(2),
	"sample_size" integer,
	"acceptance_number" integer,
	"rejection_number" integer,
	"defect_qty" integer,
	"result_auto" "qc_result",
	"result" "qc_result" NOT NULL,
	"result_note" varchar(500),
	"disposition" "qc_disposition",
	"disposition_note" varchar(500),
	"sort_ok_qty" numeric(18, 3),
	"sort_ng_qty" numeric(18, 3),
	"inspection_standard" varchar(100),
	"inspector_name" varchar(100),
	"measuring_tools" varchar(255),
	"qc_department_id" uuid,
	"resulting_status" "qc_status" NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_qc_inspections_attempt_no_positive" CHECK (attempt_no > 0),
	CONSTRAINT "chk_qc_inspections_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_qc_inspections_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0),
	CONSTRAINT "chk_qc_inspections_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0),
	CONSTRAINT "chk_qc_inspections_aql_level_positive" CHECK (aql_level IS NULL OR aql_level > 0),
	CONSTRAINT "chk_qc_inspections_ac_re_pair" CHECK ((acceptance_number IS NULL) = (rejection_number IS NULL)),
	CONSTRAINT "chk_qc_inspections_ac_re_order" CHECK (acceptance_number IS NULL OR rejection_number > acceptance_number),
	CONSTRAINT "chk_qc_inspections_disposition_requires_fail" CHECK (disposition IS NULL OR result = 'FAIL'),
	CONSTRAINT "chk_qc_inspections_sort_qty_total" CHECK (sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity),
	CONSTRAINT "chk_qc_inspections_sort_qty_pair" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)),
	CONSTRAINT "chk_qc_inspections_sort_qty_requires_sort" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'),
	CONSTRAINT "chk_qc_inspections_disposition_by_kind" CHECK (disposition IS NULL
          OR (kind = 'INCOMING' AND disposition IN ('CONCESSION','SORT','RETURN'))
          OR (kind = 'OUTGOING' AND disposition IN ('ACCEPT','REWORK','SCRAP'))),
	CONSTRAINT "chk_qc_inspections_resulting_status_by_kind" CHECK ((kind = 'INCOMING' AND resulting_status IN ('NOT_INSPECTED','PENDING','WAITING_RETURN','COMPLETED'))
          OR (kind = 'OUTGOING' AND resulting_status IN ('NOT_INSPECTED','PENDING','REWORK','COMPLETED')))
);--> statement-breakpoint

ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_aql_plan_id_qc_aql_plans_id_fk" FOREIGN KEY ("aql_plan_id") REFERENCES "public"."qc_aql_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_aql_rule_id_qc_aql_rules_id_fk" FOREIGN KEY ("aql_rule_id") REFERENCES "public"."qc_aql_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_qc_department_id_departments_id_fk" FOREIGN KEY ("qc_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "fk_qc_inspections_request" FOREIGN KEY ("qc_request_id","kind","quantity") REFERENCES "public"."qc_requests"("id","kind","quantity") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_qc_inspections_request_id_attempt_no" ON "qc_inspections" USING btree ("qc_request_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_qc_inspections_id_kind" ON "qc_inspections" USING btree ("id","kind");--> statement-breakpoint
CREATE INDEX "idx_qc_inspections_result" ON "qc_inspections" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_qc_inspections_disposition" ON "qc_inspections" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "idx_qc_inspections_confirmed_by" ON "qc_inspections" USING btree ("confirmed_by");--> statement-breakpoint
CREATE INDEX "idx_qc_inspections_aql_rule_id" ON "qc_inspections" USING btree ("aql_rule_id");--> statement-breakpoint

-- ===== PHASE 3: backfill attempt #1 cho mọi qc_requests đã có result (giữ nguyên 6 dòng) =====
-- aql_plan_id/aql_rule_id/code_letter/acceptance_number/rejection_number để NULL — bảng cũ
-- (quality_inspections) chưa từng có các cột snapshot AQL này, không có nguồn lịch sử để backfill
-- (docs/decisions/qc-aql-master-data.md). resulting_status lấy status hiện tại của request — cũng
-- không có lịch sử attempt trước đây để biết chính xác giá trị tại thời điểm attempt #1, đây là giá
-- trị tốt nhất hiện có.
ALTER TABLE "qc_attachments" DROP CONSTRAINT "qc_attachments_inspection_id_quality_inspections_id_fk";--> statement-breakpoint

WITH backfilled_attempts AS (
  INSERT INTO "qc_inspections" (
    qc_request_id, kind, quantity, attempt_no, inspection_date, inspection_level, aql_level,
    aql_plan_id, aql_rule_id, code_letter, sample_size, acceptance_number, rejection_number,
    defect_qty, result_auto, result, result_note, disposition, disposition_note, sort_ok_qty,
    sort_ng_qty, inspection_standard, inspector_name, measuring_tools, qc_department_id,
    resulting_status, confirmed_by, created_at
  )
  SELECT
    id, kind, quantity, 1, inspection_date, inspection_level, aql_level,
    NULL, NULL, NULL, sample_size, NULL, NULL,
    defect_qty, result_auto, result, result_note, disposition, disposition_note, sort_ok_qty,
    sort_ng_qty, inspection_standard, inspector_name, measuring_tools, qc_department_id,
    status, confirmed_by, COALESCE(confirmed_at, created_at)
  FROM "qc_requests"
  WHERE result IS NOT NULL
  RETURNING id, qc_request_id
)
UPDATE "qc_attachments" qa
SET inspection_id = ba.id
FROM backfilled_attempts ba
WHERE qa.inspection_id = ba.qc_request_id;--> statement-breakpoint

ALTER TABLE "qc_attachments" ADD CONSTRAINT "qc_attachments_inspection_id_qc_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

UPDATE "qc_requests" SET attempt_count = 1 WHERE result IS NOT NULL;--> statement-breakpoint

-- ===== PHASE 4: supplier_returns.qc_inspection_id — trỏ đúng attempt đã sinh ra phiếu trả NCC =====
-- fk_supplier_returns_iqc_id_qc_kind KHÔNG cần đụng — vẫn trỏ đúng qc_requests(id,kind) tự động sau
-- RENAME ở PHASE 1 (Postgres theo dõi FK qua OID của bảng/index, không phải theo tên).
ALTER TABLE "supplier_returns" ADD COLUMN "qc_inspection_id" uuid;--> statement-breakpoint

UPDATE "supplier_returns" sr
SET qc_inspection_id = qi.id
FROM "qc_inspections" qi
WHERE sr.iqc_id = qi.qc_request_id AND qi.attempt_no = 1;--> statement-breakpoint

ALTER TABLE "supplier_returns" ADD CONSTRAINT "fk_supplier_returns_qc_inspection_id_qc_kind" FOREIGN KEY ("qc_inspection_id","qc_kind") REFERENCES "public"."qc_inspections"("id","kind") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_supplier_returns_qc_inspection_id" ON "supplier_returns" USING btree ("qc_inspection_id");
