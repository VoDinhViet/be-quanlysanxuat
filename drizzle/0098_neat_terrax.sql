ALTER TABLE "orders" RENAME COLUMN "delivery_address" TO "consignee_address";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "payment_term" "payment_term";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "receipt_warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quantity_adjustment_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_receipt_warehouse_id_warehouses_id_fk" FOREIGN KEY ("receipt_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_assigned_user_id" ON "purchase_orders" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_receipt_warehouse_id" ON "purchase_orders" USING btree ("receipt_warehouse_id");