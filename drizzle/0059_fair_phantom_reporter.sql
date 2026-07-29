CREATE TYPE "public"."stock_receipt_reason" AS ENUM('PRODUCTION', 'OPENING', 'STOCKTAKE', 'DELIVERY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."stock_receipt_type" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TABLE "stock_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"order_item_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_stock_receipt_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"type" "stock_receipt_type" NOT NULL,
	"reason" "stock_receipt_reason" NOT NULL,
	"receipt_date" date NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "stock_receipts_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_stock_receipts_reason_type" CHECK ((type = 'IN' AND reason IN ('PRODUCTION', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (type = 'OUT' AND reason IN ('DELIVERY', 'STOCKTAKE', 'OTHER')))
);
--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_receipt_id_stock_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."stock_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_receipt_id" ON "stock_receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_product_id" ON "stock_receipt_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_order_item_id" ON "stock_receipt_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipts_created_by" ON "stock_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_stock_receipts_type" ON "stock_receipts" USING btree ("type") WHERE deleted_at IS NULL;