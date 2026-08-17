CREATE TABLE "outsourcing_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outsourcing_order_id" uuid NOT NULL,
	"production_job_id" uuid,
	"production_job_operation_id" uuid,
	"operation_id" uuid,
	"operation_code" varchar(50) NOT NULL,
	"operation_name" varchar(255) NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"planned_quantity" numeric(18, 3),
	"sent_before_quantity" numeric(18, 3),
	"weight" numeric(12, 3),
	"area" numeric(12, 3),
	"note" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_outsourcing_order_items_order_operation" UNIQUE("outsourcing_order_id","production_job_operation_id"),
	CONSTRAINT "chk_outsourcing_order_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_outsourcing_order_items_weight" CHECK (weight IS NULL OR weight >= 0),
	CONSTRAINT "chk_outsourcing_order_items_area" CHECK (area IS NULL OR area >= 0)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outsourcing_receipt_id" uuid NOT NULL,
	"outsourcing_order_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"weight" numeric(12, 3),
	"area" numeric(12, 3),
	"note" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_outsourcing_receipt_items_receipt_order_item" UNIQUE("outsourcing_receipt_id","outsourcing_order_item_id"),
	CONSTRAINT "chk_outsourcing_receipt_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_outsourcing_receipt_items_weight" CHECK (weight IS NULL OR weight >= 0),
	CONSTRAINT "chk_outsourcing_receipt_items_area" CHECK (area IS NULL OR area >= 0)
);
--> statement-breakpoint
-- Data migration (viết tay, .claude/rules/database.md): mỗi phiếu OS-OUT/OS-IN kiểu cũ (bảng
-- phẳng, 1 phiếu = 1 dòng) → đúng 1 dòng trong bảng con mới, chạy TRƯỚC khi drop cột cũ ở cuối
-- file. Không dựng lại được cây BOM lịch sử nên planned_quantity/sent_before_quantity backfill
-- bằng chính quantity/0 — hai cột này chỉ để hiển thị/in, không dùng để validate.
INSERT INTO "outsourcing_order_items"
  ("outsourcing_order_id", "production_job_id", "production_job_operation_id", "operation_id",
   "operation_code", "operation_name", "item_id", "quantity", "planned_quantity", "sent_before_quantity")
SELECT "id", "production_job_id", "production_job_operation_id", "operation_id",
       "operation_code", "operation_name", "item_id", "quantity", "quantity", 0
FROM "outsourcing_orders";
--> statement-breakpoint
-- OS-IN kiểu cũ luôn trỏ đúng 1 OS-OUT (`outsourcing_order_id` NOT NULL) — join an toàn vì câu
-- INSERT ở trên tạo đúng 1 dòng outsourcing_order_items cho mỗi outsourcing_orders.
INSERT INTO "outsourcing_receipt_items"
  ("outsourcing_receipt_id", "outsourcing_order_item_id", "item_id", "quantity")
SELECT r."id", oi."id", r."item_id", r."quantity"
FROM "outsourcing_receipts" r
JOIN "outsourcing_order_items" oi ON oi."outsourcing_order_id" = r."outsourcing_order_id";
--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "chk_outsourcing_orders_quantity_positive";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "chk_outsourcing_orders_expected_return_date";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP CONSTRAINT "chk_outsourcing_receipts_quantity_positive";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "outsourcing_orders_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "outsourcing_orders_production_job_id_production_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "outsourcing_orders_production_job_operation_id_production_job_operations_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "outsourcing_orders_operation_id_operations_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP CONSTRAINT "outsourcing_receipts_outsourcing_order_id_outsourcing_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP CONSTRAINT "outsourcing_receipts_item_id_items_id_fk";
--> statement-breakpoint
DROP INDEX "idx_outsourcing_orders_item_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_orders_production_job_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_orders_production_job_operation_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_orders_operation_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_receipts_outsourcing_order_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_receipts_item_id";--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_outsourcing_order_id_outsourcing_orders_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "outsourcing_receipt_items_outsourcing_receipt_id_outsourcing_receipts_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "outsourcing_receipt_items_outsourcing_order_item_id_outsourcing_order_items_id_fk" FOREIGN KEY ("outsourcing_order_item_id") REFERENCES "public"."outsourcing_order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "outsourcing_receipt_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_outsourcing_order_id" ON "outsourcing_order_items" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_item_id" ON "outsourcing_order_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_production_job_id" ON "outsourcing_order_items" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_production_job_operation_id" ON "outsourcing_order_items" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_operation_id" ON "outsourcing_order_items" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipt_items_outsourcing_receipt_id" ON "outsourcing_receipt_items" USING btree ("outsourcing_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipt_items_outsourcing_order_item_id" ON "outsourcing_receipt_items" USING btree ("outsourcing_order_item_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipt_items_item_id" ON "outsourcing_receipt_items" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "item_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "production_job_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "production_job_operation_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "operation_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "operation_code";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "operation_name";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP COLUMN "outsourcing_order_id";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP COLUMN "item_id";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP COLUMN "quantity";