-- Dữ liệu cũ của "production_orders" là 1 dòng/dòng-PO (mô hình sai đơn vị trước 2026-07-29,
-- xem docs/features/production.md) — không tương thích với ràng buộc unique(order_id) sắp thêm ở
-- cuối file này. Bảng này mới tạo trong ngày, dữ liệu chỉ là kế hoạch tính lại được từ PO nên xoá
-- sạch là an toàn; APPROVED order nào đang thiếu header sẽ được backfill lại ở cuối migration.
DELETE FROM "production_orders";--> statement-breakpoint
CREATE TABLE "production_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"production_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_jobs_code_unique" UNIQUE("code"),
	CONSTRAINT "uq_production_jobs_order_product" UNIQUE("production_order_id","product_id"),
	CONSTRAINT "chk_production_jobs_quantity" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"order_qty" numeric(18, 3) NOT NULL,
	"on_hand_qty" numeric(18, 3) NOT NULL,
	"available_qty" numeric(18, 3) NOT NULL,
	"from_stock_qty" numeric(18, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_items_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "chk_production_order_items_quantity" CHECK (quantity >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_order_item_id_unique";--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_quantity";--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_order_item_id_order_items_id_fk";
--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX "idx_production_orders_order_id";--> statement-breakpoint
DROP INDEX "idx_production_orders_product_id";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_jobs_product_id" ON "production_jobs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_production_order_items_production_order_id" ON "production_order_items" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_production_order_items_product_id" ON "production_order_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "order_item_id";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "order_qty";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "on_hand_qty";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "available_qty";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "from_stock_qty";--> statement-breakpoint
ALTER TABLE "production_orders" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_id_unique" UNIQUE("order_id");--> statement-breakpoint
-- Backfill header PENDING cho mọi PO đang trong phạm vi LSX (AWAITING_PRODUCTION/IN_PROGRESS) mà
-- không còn header sau lệnh DELETE ở trên — production_order_items để trống là hợp lệ, Tab2 tự
-- tính lại Đề xuất SX mặc định từ công thức (xem ProductionOrdersService.computeCurrentLines).
INSERT INTO "production_orders" ("order_id", "status")
SELECT "id", 'PENDING' FROM "orders" WHERE "status" IN ('AWAITING_PRODUCTION', 'IN_PROGRESS')
ON CONFLICT ("order_id") DO NOTHING;