CREATE TYPE "public"."currency" AS ENUM('VND', 'USD', 'EUR', 'JPY', 'CNY', 'KRW');--> statement-breakpoint
CREATE TYPE "public"."order_discount_type" AS ENUM('PERCENT', 'AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('NORMAL', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."upload_type" ADD VALUE 'ORDER_DOCUMENT';--> statement-breakpoint
CREATE TABLE "order_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT 0 NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"line_total" numeric(18, 2) DEFAULT 0 NOT NULL,
	"note" varchar(500),
	"status" "order_item_status" DEFAULT 'NORMAL' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_order_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_order_items_discount_percent_range" CHECK (discount_percent >= 0 AND discount_percent <= 100)
);
--> statement-breakpoint
-- `orders` picks up NOT NULL `client_id`/`order_date` below. Only 2 throwaway test rows exist on
-- this table (created during the header-only phase of this same feature, 2026-07-27) — clearing
-- them is safe and lets the NOT NULL columns land without a backfill.
DELETE FROM "orders";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" varchar(500);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_term" "payment_term";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" "currency" DEFAULT 'VND' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "exchange_rate" numeric(18, 6) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_type" "order_discount_type" DEFAULT 'PERCENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_value" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vat_percent" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vat_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "internal_note" varchar(1000);--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_attachments_order_id" ON "order_attachments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_attachments_file_id" ON "order_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product_id" ON "order_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_client_id" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_orders_staff_id" ON "orders" USING btree ("staff_id");