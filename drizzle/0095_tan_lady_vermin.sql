CREATE TYPE "public"."purchase_quotation_status" AS ENUM('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'ORDERED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "purchase_quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"quotation_date" date NOT NULL,
	"valid_until" date,
	"note" varchar(1000),
	"sent_by" uuid,
	"sent_at" timestamp,
	"received_by" uuid,
	"received_at" timestamp,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"cancellation_reason" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_quotations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"purchase_request_item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2),
	"lead_time_days" integer,
	"note" varchar(500),
	"selected_by" uuid,
	"selected_at" timestamp,
	CONSTRAINT "chk_purchase_quotation_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_purchase_quotation_items_unit_price" CHECK (unit_price IS NULL OR unit_price >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"order_date" date NOT NULL,
	"expected_date" date,
	"note" varchar(1000),
	"ordered_by" uuid,
	"ordered_at" timestamp,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"cancellation_reason" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"purchase_request_item_id" uuid NOT NULL,
	"quotation_item_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2),
	"note" varchar(500),
	CONSTRAINT "chk_purchase_order_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_purchase_order_items_unit_price" CHECK (unit_price IS NULL OR unit_price >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_submitted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD COLUMN "purchase_order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD COLUMN "cancellation_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "purchase_quotation_items_quotation_id_purchase_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."purchase_quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "purchase_quotation_items_purchase_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("purchase_request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "purchase_quotation_items_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ordered_by_users_id_fk" FOREIGN KEY ("ordered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("purchase_request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_quotation_item_id_purchase_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."purchase_quotation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotations_supplier_id" ON "purchase_quotations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotations_status" ON "purchase_quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotations_created_by" ON "purchase_quotations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_items_quotation_id" ON "purchase_quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_items_purchase_request_item_id" ON "purchase_quotation_items" USING btree ("purchase_request_item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_created_by" ON "purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_purchase_order_id" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_purchase_request_item_id" ON "purchase_order_items" USING btree ("purchase_request_item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_quotation_item_id" ON "purchase_order_items" USING btree ("quotation_item_id");--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_purchase_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_purchase_order_id" ON "inventory_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_purchase_order_item_id" ON "inventory_receipt_items" USING btree ("purchase_order_item_id");--> statement-breakpoint
ALTER TABLE "purchase_requests" DROP COLUMN "submitted_by";--> statement-breakpoint
ALTER TABLE "purchase_requests" DROP COLUMN "submitted_at";