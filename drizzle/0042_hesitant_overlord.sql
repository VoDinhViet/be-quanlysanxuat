CREATE TYPE "public"."product_revision_status" AS ENUM('DRAFT', 'APPROVED', 'RELEASED', 'OBSOLETE');--> statement-breakpoint
ALTER TABLE "product_revisions" ADD COLUMN "status" "product_revision_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS ltree;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "path" "ltree";--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_credentials_role_id" ON "credentials" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_files_uploaded_by" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_material_attachments_file_id" ON "material_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_materials_unit_id" ON "materials" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_materials_image_file_id" ON "materials" USING btree ("image_file_id");--> statement-breakpoint
CREATE INDEX "idx_materials_created_by" ON "materials" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_clients_created_by" ON "clients" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_operations_created_by" ON "operations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_product_attachments_file_id" ON "product_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_product_revisions_source_revision_id" ON "product_revisions" USING btree ("source_revision_id");--> statement-breakpoint
CREATE INDEX "idx_product_revisions_created_by" ON "product_revisions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_product_revisions_status" ON "product_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_products_client_id" ON "products" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_products_product_group_id" ON "products" USING btree ("product_group_id");--> statement-breakpoint
CREATE INDEX "idx_products_unit_id" ON "products" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_products_current_revision_id" ON "products" USING btree ("current_revision_id");--> statement-breakpoint
CREATE INDEX "idx_products_created_by" ON "products" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_products_image_file_id" ON "products" USING btree ("image_file_id");--> statement-breakpoint
CREATE INDEX "idx_bom_items_product_id" ON "bom_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_bom_items_material_id" ON "bom_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_bom_items_created_by" ON "bom_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_bom_items_path" ON "bom_items" USING btree ("path");--> statement-breakpoint
CREATE INDEX "idx_boms_created_by" ON "boms" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_revision_operations_operation_id" ON "revision_operations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_revision_operations_created_by" ON "revision_operations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_users_department_id" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_users_position_id" ON "users" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "idx_users_credential_id" ON "users" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_users_avatar_file_id" ON "users" USING btree ("avatar_file_id");--> statement-breakpoint
CREATE INDEX "idx_users_created_by" ON "users" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_supplier_attachments_file_id" ON "supplier_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_logo_file_id" ON "suppliers" USING btree ("logo_file_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_created_by" ON "suppliers" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_item_type_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL));--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_quantity_positive" CHECK (quantity > 0);