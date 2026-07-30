ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_issued_fields";--> statement-breakpoint
ALTER TABLE "production_orders" RENAME COLUMN "issued_by" TO "approved_by";--> statement-breakpoint
ALTER TABLE "production_orders" RENAME COLUMN "issued_at" TO "approved_at";--> statement-breakpoint
ALTER TABLE "production_orders" RENAME CONSTRAINT "production_orders_issued_by_credentials_id_fk" TO "production_orders_approved_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
UPDATE "production_orders" SET "status" = 'APPROVED' WHERE "status" = 'ISSUED';--> statement-breakpoint
DROP TYPE "public"."production_order_status";--> statement-breakpoint
CREATE TYPE "public"."production_order_status" AS ENUM('PENDING', 'APPROVED');--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."production_order_status";--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "status" SET DATA TYPE "public"."production_order_status" USING "status"::"public"."production_order_status";--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_status_fields" CHECK ((status = 'PENDING' AND code IS NULL AND approved_at IS NULL)
          OR (status = 'APPROVED' AND code IS NOT NULL AND approved_at IS NOT NULL));
