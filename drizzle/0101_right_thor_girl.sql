CREATE TYPE "public"."iqc_disposition" AS ENUM('CONCESSION', 'SORT', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."iqc_result" AS ENUM('PASS', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."iqc_status" AS ENUM('PENDING', 'WAITING_RETURN', 'COMPLETED');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'REJECTED' BEFORE 'AWAITING_PRODUCTION';--> statement-breakpoint
CREATE TABLE "iqc_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"inventory_receipt_id" uuid,
	"purchase_order_id" uuid,
	"supplier_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"inspection_date" date NOT NULL,
	"result" "iqc_result" NOT NULL,
	"disposition" "iqc_disposition",
	"status" "iqc_status" DEFAULT 'PENDING' NOT NULL,
	"reason" varchar(255),
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "iqc_inspections_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_iqc_inspections_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_iqc_inspections_disposition_requires_fail" CHECK (disposition IS NULL OR result = 'FAIL')
);
--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "iqc_id" uuid;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_inventory_receipt_id_inventory_receipts_id_fk" FOREIGN KEY ("inventory_receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_inventory_receipt_id" ON "iqc_inspections" USING btree ("inventory_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_purchase_order_id" ON "iqc_inspections" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_supplier_id" ON "iqc_inspections" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_item_id" ON "iqc_inspections" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_status" ON "iqc_inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_result" ON "iqc_inspections" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_inspection_date" ON "iqc_inspections" USING btree ("inspection_date");--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_created_by" ON "iqc_inspections" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_iqc_id_iqc_inspections_id_fk" FOREIGN KEY ("iqc_id") REFERENCES "public"."iqc_inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_iqc_id" ON "supplier_returns" USING btree ("iqc_id");--> statement-breakpoint
ALTER TABLE "supplier_returns" DROP COLUMN "iqc_code";