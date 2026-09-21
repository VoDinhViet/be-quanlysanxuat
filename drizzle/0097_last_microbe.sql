CREATE TABLE "purchase_quotation_item_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"unit_price" numeric(18, 2),
	"lead_time_days" integer,
	"note" varchar(500),
	"selected_by" uuid,
	"selected_at" timestamp,
	CONSTRAINT "uq_purchase_quotation_item_suppliers_item_supplier" UNIQUE("quotation_item_id","supplier_id"),
	CONSTRAINT "chk_purchase_quotation_item_suppliers_unit_price" CHECK (unit_price IS NULL OR unit_price >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "chk_purchase_quotation_items_unit_price";--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP CONSTRAINT "purchase_quotations_received_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "purchase_quotation_items_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "purchase_quotation_items_selected_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_quotation_item_id_purchase_quotation_items_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::text;--> statement-breakpoint
DROP TYPE "public"."purchase_quotation_status";--> statement-breakpoint
CREATE TYPE "public"."purchase_quotation_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"public"."purchase_quotation_status";--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DATA TYPE "public"."purchase_quotation_status" USING "status"::"public"."purchase_quotation_status";--> statement-breakpoint
DROP INDEX "idx_purchase_quotation_items_supplier_id";--> statement-breakpoint
DROP INDEX "idx_purchase_order_items_quotation_item_id";--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD COLUMN "quantity_adjustment_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quotation_item_supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD CONSTRAINT "purchase_quotation_item_suppliers_quotation_item_id_purchase_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."purchase_quotation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD CONSTRAINT "purchase_quotation_item_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD CONSTRAINT "purchase_quotation_item_suppliers_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_suppliers_quotation_item_id" ON "purchase_quotation_item_suppliers" USING btree ("quotation_item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_suppliers_supplier_id" ON "purchase_quotation_item_suppliers" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_quotation_item_suppliers_winner_per_item" ON "purchase_quotation_item_suppliers" USING btree ("quotation_item_id") WHERE selected_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_id_purchase_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."purchase_quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_quotation_item_supplier_id_purchase_quotation_item_suppliers_id_fk" FOREIGN KEY ("quotation_item_supplier_id") REFERENCES "public"."purchase_quotation_item_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_quotation_id" ON "purchase_orders" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_quotation_item_supplier_id" ON "purchase_order_items" USING btree ("quotation_item_supplier_id");--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP COLUMN "quotation_date";--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP COLUMN "valid_until";--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP COLUMN "received_by";--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP COLUMN "received_at";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "supplier_id";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "unit_price";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "lead_time_days";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "selected_by";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "selected_at";--> statement-breakpoint
ALTER TABLE "purchase_order_items" DROP COLUMN "quotation_item_id";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "uq_purchase_quotation_items_quotation_request_item" UNIQUE("quotation_id","purchase_request_item_id");