CREATE TYPE "public"."production_job_bom_item_type" AS ENUM('FG', 'PART', 'RM');--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT "chk_production_job_bom_items_item_type";--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" DROP CONSTRAINT "outsourcing_order_items_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" DROP CONSTRAINT "outsourcing_receipt_items_item_id_items_id_fk";
--> statement-breakpoint
DROP INDEX "uq_production_job_bom_items_final_assembly";--> statement-breakpoint
ALTER TABLE "quality_inspections" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_returns" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ALTER COLUMN "item_type" SET DATA TYPE "public"."production_job_bom_item_type" USING "item_type"::text::"public"."production_job_bom_item_type";--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD COLUMN "item_code" varchar(50);--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD COLUMN "item_name" varchar(255);--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "item_code" varchar(50);--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "item_name" varchar(255);--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "outsourcing_receipt_item_id" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD COLUMN "production_job_bom_item_id" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD COLUMN "item_code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD COLUMN "item_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD COLUMN "item_code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD COLUMN "item_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_outsourcing_receipt_item_id_outsourcing_receipt_items_id_fk" FOREIGN KEY ("outsourcing_receipt_item_id") REFERENCES "public"."outsourcing_receipt_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_production_job_bom_item_id_production_job_bom_items_id_fk" FOREIGN KEY ("production_job_bom_item_id") REFERENCES "public"."production_job_bom_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "outsourcing_receipt_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_outsourcing_receipt_item_id" ON "supplier_returns" USING btree ("outsourcing_receipt_item_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_production_job_bom_item_id" ON "outsourcing_order_items" USING btree ("production_job_bom_item_id");--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "chk_production_job_bom_items_item_type" CHECK (item_type IN ('FG', 'PART', 'RM'));