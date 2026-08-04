CREATE TYPE "public"."warehouse_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('MATERIAL', 'FINISHED_GOODS', 'WIP');--> statement-breakpoint
CREATE TYPE "public"."inventory_document_status" AS ENUM('DRAFT', 'POSTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_item_type" AS ENUM('PRODUCT', 'MATERIAL');--> statement-breakpoint
CREATE TYPE "public"."inventory_receipt_type" AS ENUM('PURCHASE', 'PRODUCTION', 'RETURN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."inventory_issue_type" AS ENUM('PRODUCTION', 'SALES', 'RETURN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."inventory_reference_type" AS ENUM('INVENTORY_RECEIPT', 'INVENTORY_ISSUE');--> statement-breakpoint
CREATE TYPE "public"."inventory_transaction_type" AS ENUM('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "warehouse_type" NOT NULL,
	"status" "warehouse_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"receipt_type" "inventory_receipt_type" NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"receipt_date" date NOT NULL,
	"supplier_id" uuid,
	"purchase_request_id" uuid,
	"production_order_id" uuid,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"item_type" "inventory_item_type" NOT NULL,
	"product_id" uuid,
	"material_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2),
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_receipt_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_inventory_receipt_items_unit_price" CHECK (unit_price IS NULL OR unit_price >= 0),
	CONSTRAINT "chk_inventory_receipt_items_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "inventory_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"issue_type" "inventory_issue_type" NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"issue_date" date NOT NULL,
	"production_order_id" uuid,
	"production_job_id" uuid,
	"department_id" uuid,
	"requested_by" uuid,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_issues_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_issue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"item_type" "inventory_item_type" NOT NULL,
	"product_id" uuid,
	"material_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"order_item_id" uuid,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_issue_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "chk_inventory_issue_items_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_type" "inventory_item_type" NOT NULL,
	"product_id" uuid,
	"material_id" uuid,
	"type" "inventory_transaction_type" NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"reference_type" "inventory_reference_type" NOT NULL,
	"reference_id" uuid NOT NULL,
	"order_item_id" uuid,
	"transaction_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_transactions_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)),
	CONSTRAINT "chk_inventory_transactions_quantity_sign" CHECK ((type IN ('RECEIPT', 'TRANSFER_IN', 'PRODUCTION_IN', 'ADJUSTMENT_IN') AND quantity > 0)
          OR (type IN ('ISSUE', 'TRANSFER_OUT', 'PRODUCTION_OUT', 'ADJUSTMENT_OUT') AND quantity < 0))
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_type" "inventory_item_type" NOT NULL,
	"product_id" uuid,
	"material_id" uuid,
	"quantity" numeric(18, 3) DEFAULT 0 NOT NULL,
	"reserved_quantity" numeric(18, 3) DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_balances_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)),
	CONSTRAINT "chk_inventory_balances_quantity_non_negative" CHECK (quantity >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receipt_id_inventory_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_issue_id_inventory_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."inventory_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_warehouses_type" ON "warehouses" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_warehouses_status" ON "warehouses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_warehouse_id" ON "inventory_receipts" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_status" ON "inventory_receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_receipt_type" ON "inventory_receipts" USING btree ("receipt_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_receipt_date" ON "inventory_receipts" USING btree ("receipt_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_supplier_id" ON "inventory_receipts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_production_order_id" ON "inventory_receipts" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_created_by" ON "inventory_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_receipt_id" ON "inventory_receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_product_id" ON "inventory_receipt_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_material_id" ON "inventory_receipt_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_warehouse_id" ON "inventory_issues" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_status" ON "inventory_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_issue_type" ON "inventory_issues" USING btree ("issue_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_issue_date" ON "inventory_issues" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_production_order_id" ON "inventory_issues" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_production_job_id" ON "inventory_issues" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_department_id" ON "inventory_issues" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issues_created_by" ON "inventory_issues" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_issue_id" ON "inventory_issue_items" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_product_id" ON "inventory_issue_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_material_id" ON "inventory_issue_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_order_item_id" ON "inventory_issue_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_warehouse_id" ON "inventory_transactions" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_product_id" ON "inventory_transactions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_material_id" ON "inventory_transactions" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_order_item_id" ON "inventory_transactions" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_type" ON "inventory_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_transaction_date" ON "inventory_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_reference" ON "inventory_transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_warehouse_product" ON "inventory_transactions" USING btree ("warehouse_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_warehouse_material" ON "inventory_transactions" USING btree ("warehouse_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_balances_product" ON "inventory_balances" USING btree ("warehouse_id","product_id") WHERE product_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_balances_material" ON "inventory_balances" USING btree ("warehouse_id","material_id") WHERE material_id IS NOT NULL;