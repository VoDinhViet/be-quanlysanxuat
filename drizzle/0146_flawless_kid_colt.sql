DROP INDEX "idx_warehouses_status";--> statement-breakpoint
ALTER TABLE "warehouses" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."warehouse_status";