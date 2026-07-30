CREATE TYPE "public"."stock_receipt_subject" AS ENUM('FINISHED_GOOD', 'MATERIAL');--> statement-breakpoint
ALTER TABLE "stock_receipts" DROP CONSTRAINT "chk_stock_receipts_reason_type";--> statement-breakpoint
-- Không dùng `ALTER TYPE ... ADD VALUE` vì Postgres cấm dùng giá trị enum mới thêm trong CÙNG
-- transaction (lỗi "unsafe use of new value") — mà CHECK constraint bên dưới cần dùng
-- 'PURCHASE'/'PRODUCTION_ISSUE' ngay trong migration này. Drop rồi tạo lại type với đủ 7 giá trị
-- (type coi như "mới" trong transaction này) để né giới hạn đó, thay vì tách thành 2 lần chạy
-- `db:migrate`.
ALTER TABLE "stock_receipts" ALTER COLUMN "reason" SET DATA TYPE text USING "reason"::text;--> statement-breakpoint
DROP TYPE "public"."stock_receipt_reason";--> statement-breakpoint
CREATE TYPE "public"."stock_receipt_reason" AS ENUM('PRODUCTION', 'OPENING', 'STOCKTAKE', 'DELIVERY', 'OTHER', 'PURCHASE', 'PRODUCTION_ISSUE');--> statement-breakpoint
ALTER TABLE "stock_receipts" ALTER COLUMN "reason" SET DATA TYPE "public"."stock_receipt_reason" USING "reason"::"public"."stock_receipt_reason";--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "min_stock" numeric(18, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD COLUMN "subject" "stock_receipt_subject" DEFAULT 'FINISHED_GOOD' NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_materials_supplier_id" ON "materials" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_material_id" ON "stock_receipt_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipts_subject" ON "stock_receipts" USING btree ("subject") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "chk_stock_receipt_items_target" CHECK ((product_id IS NOT NULL AND material_id IS NULL) OR (product_id IS NULL AND material_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "chk_stock_receipts_reason_type" CHECK ((subject = 'FINISHED_GOOD' AND type = 'IN' AND reason IN ('PRODUCTION', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'FINISHED_GOOD' AND type = 'OUT' AND reason IN ('DELIVERY', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'MATERIAL' AND type = 'IN' AND reason IN ('PURCHASE', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'MATERIAL' AND type = 'OUT' AND reason IN ('PRODUCTION_ISSUE', 'STOCKTAKE', 'OTHER')));