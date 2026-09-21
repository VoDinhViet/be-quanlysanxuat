CREATE TABLE "supplier_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"purchase_order_id" uuid,
	"inventory_receipt_id" uuid,
	"iqc_code" varchar(50),
	"return_date" date NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_returns_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_supplier_returns_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_inventory_receipt_id_inventory_receipts_id_fk" FOREIGN KEY ("inventory_receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_warehouse_id" ON "supplier_returns" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_supplier_id" ON "supplier_returns" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_item_id" ON "supplier_returns" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_purchase_order_id" ON "supplier_returns" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_inventory_receipt_id" ON "supplier_returns" USING btree ("inventory_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_status" ON "supplier_returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_return_date" ON "supplier_returns" USING btree ("return_date");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_created_by" ON "supplier_returns" USING btree ("created_by");