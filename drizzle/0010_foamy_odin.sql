ALTER TABLE "clients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_operations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outside_processing_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outside_processing_receipts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bom_lines" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "operations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_types" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_steps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_order_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "permissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "clients" CASCADE;--> statement-breakpoint
DROP TABLE "job_operations" CASCADE;--> statement-breakpoint
DROP TABLE "order_files" CASCADE;--> statement-breakpoint
DROP TABLE "order_items" CASCADE;--> statement-breakpoint
DROP TABLE "orders" CASCADE;--> statement-breakpoint
DROP TABLE "outside_processing_orders" CASCADE;--> statement-breakpoint
DROP TABLE "outside_processing_receipts" CASCADE;--> statement-breakpoint
DROP TABLE "production_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_requisition_items" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_requisitions" CASCADE;--> statement-breakpoint
DROP TABLE "bom_lines" CASCADE;--> statement-breakpoint
DROP TABLE "operations" CASCADE;--> statement-breakpoint
DROP TABLE "product_files" CASCADE;--> statement-breakpoint
DROP TABLE "product_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "product_types" CASCADE;--> statement-breakpoint
DROP TABLE "products" CASCADE;--> statement-breakpoint
DROP TABLE "routing_steps" CASCADE;--> statement-breakpoint
DROP TABLE "units" CASCADE;--> statement-breakpoint
DROP TABLE "suppliers" CASCADE;--> statement-breakpoint
DROP TABLE "work_order_items" CASCADE;--> statement-breakpoint
DROP TABLE "work_orders" CASCADE;--> statement-breakpoint
DROP TABLE "permissions" CASCADE;--> statement-breakpoint
DROP TABLE "role_permissions" CASCADE;--> statement-breakpoint
DROP TABLE "roles" CASCADE;--> statement-breakpoint
-- Note: the FK constraint "users_role_id_roles_id_fk" was already dropped implicitly
-- by the "DROP TABLE roles CASCADE" above; the explicit DROP CONSTRAINT statement
-- drizzle-kit generated for it was redundant and errored ("does not exist"), so it's removed here.
ALTER TABLE "users" DROP COLUMN "role_id";--> statement-breakpoint
DROP TYPE "public"."client_type";--> statement-breakpoint
DROP TYPE "public"."job_operation_status";--> statement-breakpoint
DROP TYPE "public"."order_file_type";--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
DROP TYPE "public"."outside_processing_order_status";--> statement-breakpoint
DROP TYPE "public"."production_job_status";--> statement-breakpoint
DROP TYPE "public"."purchase_requisition_status";--> statement-breakpoint
DROP TYPE "public"."product_file_type";--> statement-breakpoint
DROP TYPE "public"."product_item_type";--> statement-breakpoint
DROP TYPE "public"."product_status";--> statement-breakpoint
DROP TYPE "public"."work_order_status";--> statement-breakpoint
-- The two statements below drop tables/enum that were applied to this DB out-of-band
-- (via an orphaned, un-tracked drizzle/0009_broad_sentinels.sql that was never in
-- meta/_journal.json), so drizzle-kit's own snapshot diff above didn't know about them.
ALTER TABLE "supplier_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "supplier_groups" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TYPE "public"."supplier_type";