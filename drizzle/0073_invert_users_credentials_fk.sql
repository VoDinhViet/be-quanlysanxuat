-- Đảo hướng khoá users <-> credentials + đổi 19 FK audit sang users.id.
-- Migration này VIẾT TAY (không phải bản drizzle-kit sinh thô) — cần backfill dữ liệu giữa các
-- bước DDL nên không thể chỉ ADD/DROP CONSTRAINT đơn thuần. Thứ tự bắt buộc:
--   1) Thêm credentials.user_id (nullable) → backfill từ users.credential_id (liên kết cũ)
--   2) Chốt credentials.user_id: NOT NULL + FK + UNIQUE
--   3) Với từng cột trong 19 cột audit: drop FK cũ (trỏ credentials.id) → remap giá trị cột từ
--      credential id sang user id (qua credentials.user_id vừa backfill) → add FK mới (trỏ users.id)
--   4) Xoá users.credential_id (liên kết cũ, không còn ai đọc)

-- 1) Backfill credentials.user_id từ liên kết cũ (users.credential_id)
ALTER TABLE "credentials" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "credentials" c SET "user_id" = u."id" FROM "users" u WHERE u."credential_id" = c."id";--> statement-breakpoint

-- 2) Chốt credentials.user_id
ALTER TABLE "credentials" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_unique" UNIQUE("user_id");--> statement-breakpoint

-- 3) 19 cột audit: drop FK cũ -> remap dữ liệu -> add FK mới, từng bảng một

-- files.uploaded_by
ALTER TABLE "files" DROP CONSTRAINT "files_uploaded_by_credentials_id_fk";--> statement-breakpoint
UPDATE "files" t SET "uploaded_by" = c."user_id" FROM "credentials" c WHERE t."uploaded_by" = c."id";--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- materials.created_by
ALTER TABLE "materials" DROP CONSTRAINT "materials_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "materials" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- clients.created_by
ALTER TABLE "clients" DROP CONSTRAINT "clients_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "clients" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- operations.created_by
ALTER TABLE "operations" DROP CONSTRAINT "operations_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "operations" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- products.created_by
ALTER TABLE "products" DROP CONSTRAINT "products_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "products" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- bom_items.created_by
ALTER TABLE "bom_items" DROP CONSTRAINT "bom_items_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "bom_items" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- boms.created_by
ALTER TABLE "boms" DROP CONSTRAINT "boms_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "boms" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- routing_steps.created_by
ALTER TABLE "routing_steps" DROP CONSTRAINT "routing_steps_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "routing_steps" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- users.created_by (self-referencing — remap qua credentials, cùng cách các bảng khác)
ALTER TABLE "users" DROP CONSTRAINT "users_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "users" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- suppliers.created_by
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "suppliers" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- orders.approved_by / rejected_by / created_by
ALTER TABLE "orders" DROP CONSTRAINT "orders_approved_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_rejected_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "orders" t SET "approved_by" = c."user_id" FROM "credentials" c WHERE t."approved_by" = c."id";--> statement-breakpoint
UPDATE "orders" t SET "rejected_by" = c."user_id" FROM "credentials" c WHERE t."rejected_by" = c."id";--> statement-breakpoint
UPDATE "orders" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- stock_receipts.created_by
ALTER TABLE "stock_receipts" DROP CONSTRAINT "stock_receipts_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "stock_receipts" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- production_job_notes.created_by
ALTER TABLE "production_job_notes" DROP CONSTRAINT "production_job_notes_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "production_job_notes" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "production_job_notes" ADD CONSTRAINT "production_job_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- production_jobs.started_by
ALTER TABLE "production_jobs" DROP CONSTRAINT "production_jobs_started_by_credentials_id_fk";--> statement-breakpoint
UPDATE "production_jobs" t SET "started_by" = c."user_id" FROM "credentials" c WHERE t."started_by" = c."id";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- production_order_logs.performed_by
ALTER TABLE "production_order_logs" DROP CONSTRAINT "production_order_logs_performed_by_credentials_id_fk";--> statement-breakpoint
UPDATE "production_order_logs" t SET "performed_by" = c."user_id" FROM "credentials" c WHERE t."performed_by" = c."id";--> statement-breakpoint
ALTER TABLE "production_order_logs" ADD CONSTRAINT "production_order_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- production_orders.approved_by / created_by
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_approved_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_created_by_credentials_id_fk";--> statement-breakpoint
UPDATE "production_orders" t SET "approved_by" = c."user_id" FROM "credentials" c WHERE t."approved_by" = c."id";--> statement-breakpoint
UPDATE "production_orders" t SET "created_by" = c."user_id" FROM "credentials" c WHERE t."created_by" = c."id";--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 4) Xoá liên kết cũ users.credential_id — chỉ sau khi đã backfill credentials.user_id (bước 1)
ALTER TABLE "users" DROP CONSTRAINT "users_credential_id_credentials_id_fk";--> statement-breakpoint
DROP INDEX "idx_users_credential_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "credential_id";
