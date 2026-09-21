ALTER TABLE "outbound_orders" DROP CONSTRAINT "outbound_orders_warehouse_id_warehouses_id_fk";
--> statement-breakpoint
ALTER TABLE "outbound_orders" ALTER COLUMN "delivery_method" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."delivery_method";--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('STANDARD', 'EXPRESS', 'PICKUP');--> statement-breakpoint
ALTER TABLE "outbound_orders" ALTER COLUMN "delivery_method" SET DATA TYPE "public"."delivery_method" USING "delivery_method"::"public"."delivery_method";--> statement-breakpoint
DROP INDEX "idx_outbound_orders_warehouse_id";--> statement-breakpoint
ALTER TABLE "outbound_orders" DROP COLUMN "warehouse_id";