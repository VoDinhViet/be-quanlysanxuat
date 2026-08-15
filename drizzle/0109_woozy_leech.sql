ALTER TYPE "public"."inventory_reference_type" ADD VALUE 'OUTSOURCING_ORDER';--> statement-breakpoint
ALTER TYPE "public"."inventory_reference_type" ADD VALUE 'OUTSOURCING_RECEIPT';--> statement-breakpoint
CREATE TABLE "outsourcing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"production_job_id" uuid,
	"production_job_operation_id" uuid,
	"operation_id" uuid,
	"operation_code" varchar(50) NOT NULL,
	"operation_name" varchar(255) NOT NULL,
	"send_date" date NOT NULL,
	"expected_return_date" date,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outsourcing_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_outsourcing_orders_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_outsourcing_orders_expected_return_date" CHECK (expected_return_date IS NULL OR expected_return_date >= send_date)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"outsourcing_order_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"receipt_date" date NOT NULL,
	"requires_iqc" boolean DEFAULT false NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outsourcing_receipts_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_outsourcing_receipts_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "outsourcing_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "outsourcing_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_production_job_operation_id_production_job_operations_id_fk" FOREIGN KEY ("production_job_operation_id") REFERENCES "public"."production_job_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_outsourcing_order_id_outsourcing_orders_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_warehouse_id" ON "outsourcing_orders" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_supplier_id" ON "outsourcing_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_item_id" ON "outsourcing_orders" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_production_job_id" ON "outsourcing_orders" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_production_job_operation_id" ON "outsourcing_orders" USING btree ("production_job_operation_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_operation_id" ON "outsourcing_orders" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_status" ON "outsourcing_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_send_date" ON "outsourcing_orders" USING btree ("send_date");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_orders_created_by" ON "outsourcing_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_outsourcing_order_id" ON "outsourcing_receipts" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_warehouse_id" ON "outsourcing_receipts" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_supplier_id" ON "outsourcing_receipts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_item_id" ON "outsourcing_receipts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_status" ON "outsourcing_receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_receipt_date" ON "outsourcing_receipts" USING btree ("receipt_date");--> statement-breakpoint
CREATE INDEX "idx_outsourcing_receipts_created_by" ON "outsourcing_receipts" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_outsourcing_receipt_id_outsourcing_receipts_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_outsourcing_receipt_id_outsourcing_receipts_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_iqc_inspections_outsourcing_receipt_id" ON "iqc_inspections" USING btree ("outsourcing_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_returns_outsourcing_receipt_id" ON "supplier_returns" USING btree ("outsourcing_receipt_id");