-- Split off 0168_chemical_union_jack.sql: `ALTER TYPE ... ADD VALUE 'INVENTORY_ADJUSTMENT'` must
-- commit in its own transaction before the value can be referenced (Postgres restriction, not
-- optional) — the schema-narrowing statements below reference it, so they have to live in the
-- next migration file, not the same one that adds the enum value.
--
-- The prod-only data migration that used to live here (8 legacy receiptType/issueType=ADJUSTMENT
-- test documents, moved into inventory_adjustments) was run directly against production on
-- 2026-08-31 and is not part of this file — it referenced hardcoded production item/user ids that
-- don't exist on other environments, which would break `pnpm db:migrate` there with a foreign-key
-- violation. See `docs/decisions/legacy-adjustment-docs-migration.md`.
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
ALTER TABLE "inventory_receipt_items" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
-- Data migration: backfill unit_id on existing lines from the item's base unit (same default the
-- app uses when a payload omits unitId) before locking the column NOT NULL below.
UPDATE "inventory_receipt_items" iri SET "unit_id" = i."unit_id" FROM "items" i WHERE i."id" = iri."item_id" AND iri."unit_id" IS NULL;--> statement-breakpoint
UPDATE "inventory_issue_items" iii SET "unit_id" = i."unit_id" FROM "items" i WHERE i."id" = iii."item_id" AND iii."unit_id" IS NULL;--> statement-breakpoint
UPDATE "inventory_requisition_items" irqi SET "unit_id" = i."unit_id" FROM "items" i WHERE i."id" = irqi."item_id" AND irqi."unit_id" IS NULL;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ALTER COLUMN "unit_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ALTER COLUMN "unit_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ALTER COLUMN "unit_id" SET NOT NULL;--> statement-breakpoint
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
