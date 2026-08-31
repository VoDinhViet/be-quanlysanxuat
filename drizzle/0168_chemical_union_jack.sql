CREATE TYPE "public"."inventory_adjustment_reason" AS ENUM('STOCKTAKE', 'DAMAGED', 'LOST', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."inventory_adjustment_type" AS ENUM('INCREASE', 'DECREASE');--> statement-breakpoint
ALTER TYPE "public"."inventory_reference_type" ADD VALUE 'INVENTORY_ADJUSTMENT' BEFORE 'SUPPLIER_RETURN';--> statement-breakpoint
CREATE TABLE "item_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"conversion_factor" numeric(18, 6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_item_units_item_unit" UNIQUE("item_id","unit_id"),
	CONSTRAINT "chk_item_units_conversion_factor_positive" CHECK (conversion_factor > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"adjustment_type" "inventory_adjustment_type" NOT NULL,
	"reason" "inventory_adjustment_reason" NOT NULL,
	"adjustment_date" date NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_adjustments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_inventory_adjustment_items_adjustment_item" UNIQUE("adjustment_id","item_id"),
	CONSTRAINT "chk_inventory_adjustment_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "warehouses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "warehouses" CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT "uq_inventory_balances_warehouse_item";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT "chk_inventory_balances_reserved_quantity_non_negative";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP CONSTRAINT "chk_supplier_returns_warehouse_required";--> statement-breakpoint
ALTER TABLE "inventory_receipts" ALTER COLUMN "receipt_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."inventory_receipt_type";--> statement-breakpoint
CREATE TYPE "public"."inventory_receipt_type" AS ENUM('PURCHASE', 'PRODUCTION', 'RETURN');--> statement-breakpoint
ALTER TABLE "inventory_receipts" ALTER COLUMN "receipt_type" SET DATA TYPE "public"."inventory_receipt_type" USING "receipt_type"::"public"."inventory_receipt_type";--> statement-breakpoint
ALTER TABLE "inventory_issues" ALTER COLUMN "issue_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."inventory_issue_type";--> statement-breakpoint
CREATE TYPE "public"."inventory_issue_type" AS ENUM('PRODUCTION', 'SALES', 'RETURN');--> statement-breakpoint
ALTER TABLE "inventory_issues" ALTER COLUMN "issue_type" SET DATA TYPE "public"."inventory_issue_type" USING "issue_type"::"public"."inventory_issue_type";--> statement-breakpoint
DROP INDEX "idx_inventory_receipts_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_inventory_issues_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_inventory_requisitions_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_warehouse_item";--> statement-breakpoint
DROP INDEX "idx_inventory_balances_item_id";--> statement-breakpoint
DROP INDEX "idx_supplier_returns_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_outsourcing_orders_warehouse_id";--> statement-breakpoint
DROP INDEX "idx_purchase_orders_receipt_warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_inventory_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_units_item_id" ON "item_units" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_item_units_unit_id" ON "item_units" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustments_status" ON "inventory_adjustments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustments_adjustment_type" ON "inventory_adjustments" USING btree ("adjustment_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustments_adjustment_date" ON "inventory_adjustments" USING btree ("adjustment_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustments_created_by" ON "inventory_adjustments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustments_posted_by" ON "inventory_adjustments" USING btree ("posted_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustment_items_adjustment_id" ON "inventory_adjustment_items" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustment_items_item_id" ON "inventory_adjustment_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_adjustment_items_unit_id" ON "inventory_adjustment_items" USING btree ("unit_id");--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ADD CONSTRAINT "inventory_requisition_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_confirmed_by" ON "inventory_receipts" USING btree ("confirmed_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_unit_id" ON "inventory_receipt_items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_unit_id" ON "inventory_issue_items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisition_items_unit_id" ON "inventory_requisition_items" USING btree ("unit_id");--> statement-breakpoint
ALTER TABLE "inventory_receipts" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_issues" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_requisitions" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP COLUMN "reserved_quantity";--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP COLUMN "warehouse_id";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN "receipt_warehouse_id";--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_unique" UNIQUE("item_id");--> statement-breakpoint
DROP TYPE "public"."warehouse_type";