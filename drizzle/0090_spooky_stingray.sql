CREATE TYPE "public"."item_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('FG', 'WIP', 'RM');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "item_type" DEFAULT 'FG' NOT NULL,
	"image_file_id" uuid,
	"cloned_from_item_id" uuid,
	"status" "item_status" DEFAULT 'ACTIVE' NOT NULL,
	"note" varchar(1000),
	"client_id" uuid,
	"unit_id" uuid NOT NULL,
	"supplier_id" uuid,
	"min_stock" numeric(18, 3) DEFAULT 0 NOT NULL,
	"material_grade" varchar(255),
	"technical_standard" varchar(255),
	"dimensions" varchar(255),
	"specific_weight" numeric(12, 3),
	"color_surface" varchar(255),
	"description" varchar(2000),
	"origin" varchar(255),
	"lead_time" varchar(100),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "routings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "routings_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "routing_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routing_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "boms" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint

INSERT INTO "items" ("id", "code", "name", "type", "image_file_id", "cloned_from_item_id", "status", "note", "client_id", "unit_id", "created_by", "created_at", "updated_at", "deleted_at")
SELECT "id", "code", "name",
  CASE "type" WHEN 'FINISHED_GOOD' THEN 'FG'::"item_type" WHEN 'WORK_IN_PROGRESS' THEN 'WIP'::"item_type" END,
  "image_file_id", "cloned_from_product_id", "status"::text::"item_status", "note", "client_id", "unit_id", "created_by", "created_at", "updated_at", "deleted_at"
FROM "products";--> statement-breakpoint

INSERT INTO "items" ("id", "code", "name", "type", "image_file_id", "status", "note", "client_id", "unit_id", "supplier_id", "min_stock", "material_grade", "technical_standard", "dimensions", "specific_weight", "color_surface", "description", "origin", "lead_time", "created_by", "created_at", "updated_at")
SELECT "id", "code", "name", 'RM'::"item_type", "image_file_id", "status"::text::"item_status", "note", "client_id", "unit_id", "supplier_id", "min_stock", "material_grade", "technical_standard", "dimensions", "specific_weight", "color_surface", "description", "origin", "lead_time", "created_by", "created_at", "updated_at"
FROM "materials";--> statement-breakpoint

INSERT INTO "routings" ("id", "item_id", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), t."item_id", t."created_by", t."created_at", t."updated_at"
FROM (
  SELECT DISTINCT ON ("product_id") "product_id" AS "item_id", "created_by", "created_at", "updated_at"
  FROM "product_operations"
  ORDER BY "product_id", "sort_order", "created_at"
) t;--> statement-breakpoint

INSERT INTO "routing_operations" ("id", "routing_id", "operation_id", "sort_order", "note", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), r."id", po."operation_id", po."sort_order", po."note", po."created_by", po."created_at", po."updated_at"
FROM "product_operations" po
JOIN "routings" r ON r."item_id" = po."product_id";--> statement-breakpoint

INSERT INTO "bom_items" ("id", "bom_id", "parent_id", "item_id", "quantity", "level", "sort_order", "note", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), bi."bom_id", bm."bom_item_id", bm."material_id", bm."quantity", bi."level" + 1, bm."sort_order", bm."note", bm."created_by", bm."created_at", bm."updated_at"
FROM "bom_materials" bm
JOIN "bom_items" bi ON bi."id" = bm."bom_item_id";--> statement-breakpoint

UPDATE "boms" SET "item_id" = "product_id";--> statement-breakpoint
UPDATE "bom_items" SET "item_id" = "product_id" WHERE "item_id" IS NULL;--> statement-breakpoint
UPDATE "order_items" SET "item_id" = "product_id";--> statement-breakpoint
UPDATE "inventory_receipt_items" SET "item_id" = CASE "item_type" WHEN 'PRODUCT' THEN "product_id" WHEN 'MATERIAL' THEN "material_id" END;--> statement-breakpoint
UPDATE "inventory_issue_items" SET "item_id" = CASE "item_type" WHEN 'PRODUCT' THEN "product_id" WHEN 'MATERIAL' THEN "material_id" END;--> statement-breakpoint
UPDATE "inventory_transactions" SET "item_id" = CASE "item_type" WHEN 'PRODUCT' THEN "product_id" WHEN 'MATERIAL' THEN "material_id" END;--> statement-breakpoint
UPDATE "inventory_balances" SET "item_id" = CASE "item_type" WHEN 'PRODUCT' THEN "product_id" WHEN 'MATERIAL' THEN "material_id" END;--> statement-breakpoint
UPDATE "production_order_items" SET "item_id" = "product_id";--> statement-breakpoint
UPDATE "production_jobs" SET "item_id" = "product_id";--> statement-breakpoint
UPDATE "production_job_bom_items" SET "item_id" = COALESCE("product_id", "material_id");--> statement-breakpoint
UPDATE "production_job_materials" SET "item_id" = "material_id";--> statement-breakpoint
UPDATE "purchase_request_items" SET "item_id" = "material_id";--> statement-breakpoint

ALTER TABLE "boms" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "production_order_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "production_jobs" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "material_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "materials" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "material_attachments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bom_materials" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_operations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "material_groups" CASCADE;--> statement-breakpoint
DROP TABLE "materials" CASCADE;--> statement-breakpoint
DROP TABLE "material_attachments" CASCADE;--> statement-breakpoint
DROP TABLE "product_groups" CASCADE;--> statement-breakpoint
DROP TABLE "products" CASCADE;--> statement-breakpoint
DROP TABLE "bom_materials" CASCADE;--> statement-breakpoint
DROP TABLE "product_operations" CASCADE;--> statement-breakpoint
ALTER TABLE "boms" DROP CONSTRAINT "boms_product_id_unique";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT "uq_production_jobs_order_product";--> statement-breakpoint
ALTER TABLE "production_job_materials" DROP CONSTRAINT "uq_production_job_materials_job_material";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP CONSTRAINT "chk_inventory_receipt_items_target";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP CONSTRAINT "chk_inventory_issue_items_target";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "chk_inventory_transactions_target";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT "chk_inventory_balances_target";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT "chk_production_job_bom_items_item_type_target";--> statement-breakpoint
ALTER TABLE "boms" DROP CONSTRAINT IF EXISTS "boms_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "bom_items" DROP CONSTRAINT IF EXISTS "bom_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP CONSTRAINT IF EXISTS "inventory_receipt_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP CONSTRAINT IF EXISTS "inventory_receipt_items_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP CONSTRAINT IF EXISTS "inventory_issue_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP CONSTRAINT IF EXISTS "inventory_issue_items_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP CONSTRAINT IF EXISTS "inventory_transactions_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP CONSTRAINT IF EXISTS "inventory_transactions_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT IF EXISTS "inventory_balances_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT IF EXISTS "inventory_balances_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "production_order_items" DROP CONSTRAINT IF EXISTS "production_order_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT IF EXISTS "production_jobs_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT IF EXISTS "production_job_bom_items_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT IF EXISTS "production_job_bom_items_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_materials" DROP CONSTRAINT IF EXISTS "production_job_materials_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "purchase_request_items" DROP CONSTRAINT IF EXISTS "purchase_request_items_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."warehouse_type";--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('RM', 'FG', 'WIP');--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "type" SET DATA TYPE "public"."warehouse_type" USING (CASE "type" WHEN 'MATERIAL' THEN 'RM' WHEN 'FINISHED_GOODS' THEN 'FG' WHEN 'WIP' THEN 'WIP' END)::"public"."warehouse_type";--> statement-breakpoint
DROP INDEX "idx_bom_items_product_id";--> statement-breakpoint
DROP INDEX "idx_order_items_product_id";--> statement-breakpoint
DROP INDEX "idx_inventory_receipt_items_product_id";--> statement-breakpoint
DROP INDEX "idx_inventory_receipt_items_material_id";--> statement-breakpoint
DROP INDEX "idx_inventory_issue_items_product_id";--> statement-breakpoint
DROP INDEX "idx_inventory_issue_items_material_id";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_product_id";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_material_id";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_warehouse_product";--> statement-breakpoint
DROP INDEX "idx_inventory_transactions_warehouse_material";--> statement-breakpoint
DROP INDEX "uq_inventory_balances_product";--> statement-breakpoint
DROP INDEX "uq_inventory_balances_material";--> statement-breakpoint
DROP INDEX "idx_production_order_items_product_id";--> statement-breakpoint
DROP INDEX "idx_production_jobs_product_id";--> statement-breakpoint
DROP INDEX "idx_production_job_bom_items_product_id";--> statement-breakpoint
DROP INDEX "idx_production_job_bom_items_material_id";--> statement-breakpoint
DROP INDEX "idx_production_job_materials_material_id";--> statement-breakpoint
DROP INDEX "idx_purchase_request_items_material_id";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ALTER COLUMN "item_type" SET DATA TYPE "public"."item_type" USING (CASE "item_type"::text WHEN 'PRODUCT' THEN 'WIP' WHEN 'MATERIAL' THEN 'RM' END)::"public"."item_type";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cloned_from_item_id_items_id_fk" FOREIGN KEY ("cloned_from_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routings" ADD CONSTRAINT "routings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routings" ADD CONSTRAINT "routings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_routing_id_routings_id_fk" FOREIGN KEY ("routing_id") REFERENCES "public"."routings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_items_client_id" ON "items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_items_unit_id" ON "items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_items_supplier_id" ON "items" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_items_cloned_from_item_id" ON "items" USING btree ("cloned_from_item_id");--> statement-breakpoint
CREATE INDEX "idx_items_created_by" ON "items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_items_image_file_id" ON "items" USING btree ("image_file_id");--> statement-breakpoint
CREATE INDEX "idx_items_type" ON "items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_items_status" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_routings_created_by" ON "routings" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_routing_operations_routing_id" ON "routing_operations" USING btree ("routing_id");--> statement-breakpoint
CREATE INDEX "idx_routing_operations_operation_id" ON "routing_operations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_routing_operations_created_by" ON "routing_operations" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_items" ADD CONSTRAINT "inventory_issue_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "production_job_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_items_item_id" ON "bom_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_item_id" ON "order_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_items_item_id" ON "inventory_receipt_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_items_item_id" ON "inventory_issue_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_item_id" ON "inventory_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_transactions_warehouse_item" ON "inventory_transactions" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_production_order_items_item_id" ON "production_order_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_production_jobs_item_id" ON "production_jobs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_item_id" ON "production_job_bom_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_materials_item_id" ON "production_job_materials" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_request_items_item_id" ON "purchase_request_items" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "boms" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "bom_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "inventory_issue_items" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "inventory_transactions" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "production_order_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "production_jobs" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "production_job_materials" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "purchase_request_items" DROP COLUMN "material_id";--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_item_id_unique" UNIQUE("item_id");--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "uq_inventory_balances_warehouse_item" UNIQUE("warehouse_id","item_id");--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "uq_production_jobs_order_item" UNIQUE("production_order_id","item_id");--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "uq_production_job_materials_job_item" UNIQUE("production_job_id","item_id");--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "chk_production_job_bom_items_item_type_leaf" CHECK (item_type IN ('WIP', 'RM'));--> statement-breakpoint
DROP TYPE "public"."material_status";--> statement-breakpoint
DROP TYPE "public"."material_type";--> statement-breakpoint
DROP TYPE "public"."product_status";--> statement-breakpoint
DROP TYPE "public"."product_type";--> statement-breakpoint
DROP TYPE "public"."bom_item_type";--> statement-breakpoint
DROP TYPE "public"."inventory_item_type";