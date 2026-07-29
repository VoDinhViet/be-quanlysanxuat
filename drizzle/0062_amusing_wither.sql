CREATE TYPE "public"."production_order_status" AS ENUM('PENDING', 'ISSUED');--> statement-breakpoint
ALTER TABLE "production_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "production_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_quantity_positive";--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_from_stock_qty_non_negative";--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "issued_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "status" "production_order_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_quantity" CHECK ((status = 'ISSUED' AND quantity > 0) OR (status = 'PENDING' AND quantity >= 0));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_issued_fields" CHECK ((status = 'ISSUED' AND code IS NOT NULL AND issued_at IS NOT NULL)
          OR (status = 'PENDING' AND code IS NULL AND issued_at IS NULL));