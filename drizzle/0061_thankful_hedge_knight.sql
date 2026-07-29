CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"order_qty" numeric(18, 3) NOT NULL,
	"on_hand_qty" numeric(18, 3) NOT NULL,
	"available_qty" numeric(18, 3) NOT NULL,
	"from_stock_qty" numeric(18, 3) NOT NULL,
	"note" varchar(1000),
	"issued_by" uuid,
	"issued_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "production_orders_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "chk_production_orders_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_production_orders_from_stock_qty_non_negative" CHECK (from_stock_qty >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"order_qty" numeric(18, 3) NOT NULL,
	"on_hand_qty" numeric(18, 3) NOT NULL,
	"available_qty" numeric(18, 3) NOT NULL,
	"from_stock_qty" numeric(18, 3) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_plans_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "chk_production_plans_quantity_non_negative" CHECK (quantity >= 0),
	CONSTRAINT "chk_production_plans_from_stock_qty_non_negative" CHECK (from_stock_qty >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_issued_by_credentials_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_orders_order_id" ON "production_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_production_orders_product_id" ON "production_orders" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_production_plans_order_id" ON "production_plans" USING btree ("order_id");