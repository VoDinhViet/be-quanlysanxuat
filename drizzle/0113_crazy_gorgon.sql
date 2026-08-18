CREATE TYPE "public"."delivery_method" AS ENUM('ON_SITE', 'EXPRESS');--> statement-breakpoint
CREATE TYPE "public"."outbound_order_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'PENDING_DELIVERY', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "outbound_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"client_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"delivery_method" "delivery_method" NOT NULL,
	"status" "outbound_order_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(500),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "outbound_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbound_order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"production_job_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"note" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_outbound_order_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_outbound_order_id_outbound_orders_id_fk" FOREIGN KEY ("outbound_order_id") REFERENCES "public"."outbound_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_client_id" ON "outbound_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_warehouse_id" ON "outbound_orders" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_status" ON "outbound_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_delivery_date" ON "outbound_orders" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_created_by" ON "outbound_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_outbound_order_items_outbound_order_id" ON "outbound_order_items" USING btree ("outbound_order_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_order_items_order_item_id" ON "outbound_order_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_order_items_item_id" ON "outbound_order_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_order_items_production_job_id" ON "outbound_order_items" USING btree ("production_job_id");