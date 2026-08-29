CREATE TYPE "public"."quality_disposition" AS ENUM('CONCESSION', 'SORT', 'RETURN', 'ACCEPT', 'REWORK', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."quality_inspection_decision" AS ENUM('PENDING', 'PASS', 'FAIL', 'HOLD', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."quality_inspection_origin_type" AS ENUM('INVENTORY_RECEIPT', 'OUTSOURCING_RECEIPT_ITEM', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."quality_inspection_status" AS ENUM('DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."quality_inspection_type" AS ENUM('IQC', 'OQC');--> statement-breakpoint
CREATE TYPE "public"."quality_evidence_kind" AS ENUM('QC_EVIDENCE', 'DISPOSITION_EVIDENCE');--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_no" varchar(50) NOT NULL,
	"inspection_type" "quality_inspection_type" NOT NULL,
	"origin_type" "quality_inspection_origin_type" DEFAULT 'MANUAL' NOT NULL,
	"origin_id" uuid,
	"purchase_order_id" uuid,
	"supplier_id" uuid,
	"client_id" uuid,
	"production_job_id" uuid,
	"production_job_operation_id" uuid,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"requested_at" timestamp NOT NULL,
	"inspection_level" "qc_inspection_level",
	"aql_level" numeric(4, 2),
	"sample_size" integer,
	"defect_qty" integer,
	"decision" "quality_inspection_decision",
	"disposition" "quality_disposition",
	"status" "quality_inspection_status" DEFAULT 'DRAFT' NOT NULL,
	"reason" varchar(255),
	"note" varchar(1000),
	"decision_note" varchar(500),
	"disposition_note" varchar(500),
	"inspection_standard" varchar(100),
	"inspector_name" varchar(100),
	"measuring_tools" varchar(255),
	"inspected_by" uuid,
	"started_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"completed_at" timestamp,
	"qc_department_id" uuid,
	"sort_ok_qty" numeric(18, 3),
	"sort_ng_qty" numeric(18, 3),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quality_inspections_inspection_no_unique" UNIQUE("inspection_no"),
	CONSTRAINT "chk_quality_inspections_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_quality_inspections_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0),
	CONSTRAINT "chk_quality_inspections_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0),
	CONSTRAINT "chk_quality_inspections_aql_level_positive" CHECK (aql_level IS NULL OR aql_level > 0),
	CONSTRAINT "chk_quality_inspections_disposition_requires_fail" CHECK (disposition IS NULL OR decision = 'FAIL'),
	CONSTRAINT "chk_quality_inspections_sort_qty_pair" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)),
	CONSTRAINT "chk_quality_inspections_sort_qty_requires_sort" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'),
	CONSTRAINT "chk_quality_inspections_sort_qty_total" CHECK (sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity),
	CONSTRAINT "chk_quality_inspections_origin_id_pair" CHECK ((origin_type = 'MANUAL') = (origin_id IS NULL)),
	CONSTRAINT "chk_quality_inspections_oqc_no_supplier" CHECK (inspection_type <> 'OQC' OR supplier_id IS NULL),
	CONSTRAINT "chk_quality_inspections_oqc_no_client" CHECK (inspection_type <> 'OQC' OR client_id IS NULL),
	CONSTRAINT "chk_quality_inspections_supplier_client_exclusive" CHECK (NOT (supplier_id IS NOT NULL AND client_id IS NOT NULL)),
	CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields" CHECK (inspection_type <> 'OQC' OR (
        reason IS NULL AND inspection_standard IS NULL AND inspector_name IS NULL
        AND measuring_tools IS NULL AND qc_department_id IS NULL
        AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      )),
	CONSTRAINT "chk_quality_inspections_oqc_job" CHECK (inspection_type <> 'OQC' OR (production_job_id IS NOT NULL AND production_job_operation_id IS NOT NULL)),
	CONSTRAINT "chk_quality_inspections_status_in_use" CHECK (status <> 'CANCELLED'),
	CONSTRAINT "chk_quality_inspections_decision_in_use" CHECK (decision IS NULL OR decision IN ('PASS','FAIL')),
	CONSTRAINT "chk_quality_inspections_attempt_count_non_negative" CHECK (attempt_count >= 0)
);
--> statement-breakpoint
-- Tạo trước khối FK composite bên dưới cần đến — drizzle-kit mặc định gom mọi CREATE (UNIQUE)
-- INDEX xuống cuối file, nhưng FK composite (quality_inspection_results → quality_inspections)
-- cần "uq_quality_inspections_id_type_quantity" tồn tại trước khi ALTER TABLE ADD CONSTRAINT chạy.
CREATE UNIQUE INDEX "uq_quality_inspections_id_type" ON "quality_inspections" USING btree ("id","inspection_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_inspections_id_type_quantity" ON "quality_inspections" USING btree ("id","inspection_type","quantity");
--> statement-breakpoint
CREATE TABLE "quality_inspection_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quality_inspection_id" uuid NOT NULL,
	"inspection_type" "quality_inspection_type" NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"attempt_no" integer NOT NULL,
	"inspected_at" timestamp NOT NULL,
	"inspection_level" "qc_inspection_level",
	"aql_level" numeric(4, 2),
	"aql_plan_id" uuid,
	"aql_rule_id" uuid,
	"code_letter" varchar(2),
	"sample_size" integer,
	"acceptance_number" integer,
	"rejection_number" integer,
	"defect_qty" integer,
	"decision" "quality_inspection_decision" NOT NULL,
	"decision_note" varchar(500),
	"disposition" "quality_disposition",
	"disposition_note" varchar(500),
	"sort_ok_qty" numeric(18, 3),
	"sort_ng_qty" numeric(18, 3),
	"inspection_standard" varchar(100),
	"inspector_name" varchar(100),
	"measuring_tools" varchar(255),
	"qc_department_id" uuid,
	"resulting_status" "quality_inspection_status" NOT NULL,
	"inspected_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_quality_inspection_results_attempt_no_positive" CHECK (attempt_no > 0),
	CONSTRAINT "chk_quality_inspection_results_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_quality_inspection_results_sample_size_positive" CHECK (sample_size IS NULL OR sample_size > 0),
	CONSTRAINT "chk_quality_inspection_results_defect_qty_non_negative" CHECK (defect_qty IS NULL OR defect_qty >= 0),
	CONSTRAINT "chk_quality_inspection_results_aql_level_positive" CHECK (aql_level IS NULL OR aql_level > 0),
	CONSTRAINT "chk_quality_inspection_results_ac_re_pair" CHECK ((acceptance_number IS NULL) = (rejection_number IS NULL)),
	CONSTRAINT "chk_quality_inspection_results_ac_re_order" CHECK (acceptance_number IS NULL OR rejection_number > acceptance_number),
	CONSTRAINT "chk_quality_inspection_results_disposition_requires_fail" CHECK (disposition IS NULL OR decision = 'FAIL'),
	CONSTRAINT "chk_quality_inspection_results_sort_qty_total" CHECK (sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity),
	CONSTRAINT "chk_quality_inspection_results_sort_qty_pair" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)),
	CONSTRAINT "chk_quality_inspection_results_sort_qty_requires_sort" CHECK ((sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'),
	CONSTRAINT "chk_quality_inspection_results_status_in_use" CHECK (resulting_status <> 'CANCELLED'),
	CONSTRAINT "chk_quality_inspection_results_decision_in_use" CHECK (decision IN ('PASS','FAIL'))
);
--> statement-breakpoint
CREATE TABLE "quality_inspection_evidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quality_inspection_result_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "quality_evidence_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_quality_inspection_evidences_result_file_kind" UNIQUE("quality_inspection_result_id","file_id","kind")
);
--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_qc_department_id_departments_id_fk" FOREIGN KEY ("qc_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_results" ADD CONSTRAINT "quality_inspection_results_aql_plan_id_qc_aql_plans_id_fk" FOREIGN KEY ("aql_plan_id") REFERENCES "public"."qc_aql_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_results" ADD CONSTRAINT "quality_inspection_results_aql_rule_id_qc_aql_rules_id_fk" FOREIGN KEY ("aql_rule_id") REFERENCES "public"."qc_aql_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_results" ADD CONSTRAINT "quality_inspection_results_qc_department_id_departments_id_fk" FOREIGN KEY ("qc_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_results" ADD CONSTRAINT "quality_inspection_results_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_results" ADD CONSTRAINT "fk_quality_inspection_results_inspection" FOREIGN KEY ("quality_inspection_id","inspection_type","quantity") REFERENCES "public"."quality_inspections"("id","inspection_type","quantity") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quality_inspection_evidences" ADD CONSTRAINT "quality_inspection_evidences_quality_inspection_result_id_quality_inspection_results_id_fk" FOREIGN KEY ("quality_inspection_result_id") REFERENCES "public"."quality_inspection_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_evidences" ADD CONSTRAINT "quality_inspection_evidences_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_origin" ON "quality_inspections" USING btree ("origin_type","origin_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_purchase_order_id" ON "quality_inspections" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_supplier_id" ON "quality_inspections" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_client_id" ON "quality_inspections" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_production_job_id" ON "quality_inspections" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_production_job_operation_id" ON "quality_inspections" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_item_id" ON "quality_inspections" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_type" ON "quality_inspections" USING btree ("inspection_type");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_status" ON "quality_inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_decision" ON "quality_inspections" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_disposition" ON "quality_inspections" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_requested_at" ON "quality_inspections" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_created_by" ON "quality_inspections" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_qc_department_id" ON "quality_inspections" USING btree ("qc_department_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_inspected_by" ON "quality_inspections" USING btree ("inspected_by");--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_approved_by" ON "quality_inspections" USING btree ("approved_by");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_inspection_results_inspection_attempt" ON "quality_inspection_results" USING btree ("quality_inspection_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_inspection_results_id_type" ON "quality_inspection_results" USING btree ("id","inspection_type");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_decision" ON "quality_inspection_results" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_disposition" ON "quality_inspection_results" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_inspected_by" ON "quality_inspection_results" USING btree ("inspected_by");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_aql_rule_id" ON "quality_inspection_results" USING btree ("aql_rule_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_aql_plan_id" ON "quality_inspection_results" USING btree ("aql_plan_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_qc_department_id" ON "quality_inspection_results" USING btree ("qc_department_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_results_created_at" ON "quality_inspection_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_evidences_file_id" ON "quality_inspection_evidences" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_quality_inspection_evidences_result_id_kind" ON "quality_inspection_evidences" USING btree ("quality_inspection_result_id","kind");--> statement-breakpoint
-- Backfill quality_inspections từ qc_requests (giữ nguyên id) — xem plan migration schema QC,
-- mục "Schema đích". origin_type/origin_id thay 3 cột nguồn cũ (inventory_receipt_id/
-- outsourcing_receipt_id/outsourcing_receipt_item_id); outsourcing_receipt_id suy lại được qua
-- join outsourcing_receipt_items ở tầng service khi cần, không cần backfill riêng.
INSERT INTO "quality_inspections" (
  "id", "inspection_no", "inspection_type",
  "origin_type", "origin_id",
  "purchase_order_id", "supplier_id", "client_id",
  "production_job_id", "production_job_operation_id",
  "item_id", "quantity", "requested_at",
  "inspection_level", "aql_level", "sample_size", "defect_qty",
  "decision", "disposition", "status",
  "reason", "note", "decision_note", "disposition_note",
  "inspection_standard", "inspector_name", "measuring_tools",
  "inspected_by", "started_at", "approved_by", "approved_at",
  "qc_department_id", "sort_ok_qty", "sort_ng_qty", "attempt_count",
  "created_by", "created_at", "updated_at"
)
SELECT
  "id", "code",
  CASE "kind" WHEN 'INCOMING' THEN 'IQC' WHEN 'OUTGOING' THEN 'OQC' END::"quality_inspection_type",
  CASE
    WHEN "inventory_receipt_id" IS NOT NULL THEN 'INVENTORY_RECEIPT'
    WHEN "outsourcing_receipt_item_id" IS NOT NULL THEN 'OUTSOURCING_RECEIPT_ITEM'
    ELSE 'MANUAL'
  END::"quality_inspection_origin_type",
  COALESCE("inventory_receipt_id", "outsourcing_receipt_item_id"),
  "purchase_order_id", "supplier_id", "client_id",
  "production_job_id", "production_job_operation_id",
  "item_id", "quantity", "inspection_date",
  "inspection_level", "aql_level", "sample_size", "defect_qty",
  "result"::text::"quality_inspection_decision",
  "disposition"::text::"quality_disposition",
  CASE "status"
    WHEN 'NOT_INSPECTED' THEN 'DRAFT'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'WAITING_RETURN' THEN 'IN_PROGRESS'
    WHEN 'REWORK' THEN 'IN_PROGRESS'
    WHEN 'COMPLETED' THEN 'COMPLETED'
  END::"quality_inspection_status",
  "reason", "note", "result_note", "disposition_note",
  "inspection_standard", "inspector_name", "measuring_tools",
  "confirmed_by", "confirmed_at", "resolved_by", "resolved_at",
  "qc_department_id", "sort_ok_qty", "sort_ng_qty", "attempt_count",
  "created_by", "created_at", "updated_at"
FROM "qc_requests";
--> statement-breakpoint
-- Backfill quality_inspection_results từ qc_inspections — id giữ nguyên nên
-- quality_inspection_evidences.quality_inspection_result_id (backfill dưới) khớp thẳng qc_files.inspection_id.
INSERT INTO "quality_inspection_results" (
  "id", "quality_inspection_id", "inspection_type", "quantity",
  "attempt_no", "inspected_at",
  "inspection_level", "aql_level", "aql_plan_id", "aql_rule_id",
  "code_letter", "sample_size", "acceptance_number", "rejection_number", "defect_qty",
  "decision", "decision_note",
  "disposition", "disposition_note", "sort_ok_qty", "sort_ng_qty",
  "inspection_standard", "inspector_name", "measuring_tools", "qc_department_id",
  "resulting_status", "inspected_by", "created_at"
)
SELECT
  "id", "qc_request_id",
  CASE "kind" WHEN 'INCOMING' THEN 'IQC' WHEN 'OUTGOING' THEN 'OQC' END::"quality_inspection_type",
  "quantity", "attempt_no", "inspection_date",
  "inspection_level", "aql_level", "aql_plan_id", "aql_rule_id",
  "code_letter", "sample_size", "acceptance_number", "rejection_number", "defect_qty",
  "result"::text::"quality_inspection_decision", "result_note",
  "disposition"::text::"quality_disposition", "disposition_note", "sort_ok_qty", "sort_ng_qty",
  "inspection_standard", "inspector_name", "measuring_tools", "qc_department_id",
  CASE "resulting_status"
    WHEN 'NOT_INSPECTED' THEN 'DRAFT'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'WAITING_RETURN' THEN 'IN_PROGRESS'
    WHEN 'REWORK' THEN 'IN_PROGRESS'
    WHEN 'COMPLETED' THEN 'COMPLETED'
  END::"quality_inspection_status",
  "confirmed_by", "created_at"
FROM "qc_inspections";
--> statement-breakpoint
-- Backfill quality_inspection_evidences từ qc_files.
INSERT INTO "quality_inspection_evidences" (
  "id", "quality_inspection_result_id", "file_id", "kind", "created_at"
)
SELECT
  "id", "inspection_id", "file_id",
  "kind"::text::"quality_evidence_kind", "created_at"
FROM "qc_files";