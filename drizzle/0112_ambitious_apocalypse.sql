ALTER TABLE "outsourcing_receipts" DROP CONSTRAINT "outsourcing_receipts_warehouse_id_warehouses_id_fk";
--> statement-breakpoint
DROP INDEX "idx_outsourcing_receipts_warehouse_id";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" DROP COLUMN "warehouse_id";