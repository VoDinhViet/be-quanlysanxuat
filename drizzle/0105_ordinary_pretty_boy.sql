CREATE TABLE "purchase_quotation_item_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_item_id" uuid NOT NULL,
	"purchase_request_item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"quantity_adjustment_reason" varchar(500),
	CONSTRAINT "uq_purchase_quotation_item_allocations_item_request" UNIQUE("quotation_item_id","purchase_request_item_id"),
	CONSTRAINT "chk_purchase_quotation_item_allocations_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_allocations" ADD CONSTRAINT "purchase_quotation_item_allocations_quotation_item_id_purchase_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."purchase_quotation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_allocations" ADD CONSTRAINT "purchase_quotation_item_allocations_purchase_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("purchase_request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_allocations_quotation_item_id" ON "purchase_quotation_item_allocations" USING btree ("quotation_item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_allocations_purchase_request_item_id" ON "purchase_quotation_item_allocations" USING btree ("purchase_request_item_id");--> statement-breakpoint
-- Bước data migration viết tay (docs/domains/purchasing.md, .claude/rules/database.md) — drizzle-kit
-- không tự biết cách chuyển purchase_quotation_items từ "1 dòng/1 dòng ĐXMH" sang "1 dòng/1 vật tư".
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "uq_purchase_quotation_items_quotation_request_item";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "chk_purchase_quotation_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP CONSTRAINT "purchase_quotation_items_purchase_request_item_id_purchase_request_items_id_fk";
--> statement-breakpoint
DROP INDEX "idx_purchase_quotation_items_purchase_request_item_id";--> statement-breakpoint
-- item_id nullable tạm — backfill xong mới SET NOT NULL, vì purchase_request_item_id (nguồn backfill)
-- còn tồn tại tới lúc bị drop ở cuối file.
ALTER TABLE "purchase_quotation_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
UPDATE "purchase_quotation_items" pqi
SET "item_id" = pri."item_id"
FROM "purchase_request_items" pri
WHERE pri."id" = pqi."purchase_request_item_id";--> statement-breakpoint
-- Mỗi dòng báo giá cũ (1 dòng ĐXMH) thành 1 phân bổ — trước khi gộp trùng, lúc này mỗi
-- purchase_quotation_items.id còn 1-1 với đúng 1 dòng ĐXMH + SL gốc.
INSERT INTO "purchase_quotation_item_allocations"
  ("quotation_item_id", "purchase_request_item_id", "quantity", "quantity_adjustment_reason")
SELECT "id", "purchase_request_item_id", "quantity", "quantity_adjustment_reason"
FROM "purchase_quotation_items";--> statement-breakpoint
-- Gộp các dòng trùng (quotation_id, item_id) từ dữ liệu cũ — đúng vấn đề tính năng này giải quyết.
-- Dòng nhỏ nhất theo id là dòng sống sót (bảng không có createdAt/updatedAt để chọn theo thời gian);
-- dùng array_agg(... ORDER BY id)[1] thay vì MIN(id) vì Postgres không có aggregate MIN cho uuid.
WITH dup_groups AS (
  SELECT "quotation_id", "item_id", (array_agg("id" ORDER BY "id"))[1] AS survivor_id, array_agg("id") AS all_ids
  FROM "purchase_quotation_items" GROUP BY "quotation_id", "item_id" HAVING COUNT(*) > 1
)
UPDATE "purchase_quotation_item_allocations" a
SET "quotation_item_id" = dg.survivor_id
FROM dup_groups dg
WHERE a."quotation_item_id" = ANY(dg.all_ids) AND a."quotation_item_id" <> dg.survivor_id;--> statement-breakpoint
-- Cùng NCC xuất hiện ở 2 dòng bị gộp — bỏ bản ở dòng không sống sót trước khi re-point, để không
-- đụng uq_purchase_quotation_item_suppliers_item_supplier.
WITH dup_groups AS (
  SELECT "quotation_id", "item_id", (array_agg("id" ORDER BY "id"))[1] AS survivor_id, array_agg("id") AS all_ids
  FROM "purchase_quotation_items" GROUP BY "quotation_id", "item_id" HAVING COUNT(*) > 1
)
DELETE FROM "purchase_quotation_item_suppliers" s
USING dup_groups dg
WHERE s."quotation_item_id" = ANY(dg.all_ids) AND s."quotation_item_id" <> dg.survivor_id
  AND EXISTS (
    SELECT 1 FROM "purchase_quotation_item_suppliers" s2
    WHERE s2."quotation_item_id" = dg.survivor_id AND s2."supplier_id" = s."supplier_id"
  );--> statement-breakpoint
WITH dup_groups AS (
  SELECT "quotation_id", "item_id", (array_agg("id" ORDER BY "id"))[1] AS survivor_id, array_agg("id") AS all_ids
  FROM "purchase_quotation_items" GROUP BY "quotation_id", "item_id" HAVING COUNT(*) > 1
)
UPDATE "purchase_quotation_item_suppliers" s
SET "quotation_item_id" = dg.survivor_id
FROM dup_groups dg
WHERE s."quotation_item_id" = ANY(dg.all_ids) AND s."quotation_item_id" <> dg.survivor_id;--> statement-breakpoint
WITH dup_groups AS (
  SELECT "quotation_id", "item_id", (array_agg("id" ORDER BY "id"))[1] AS survivor_id, array_agg("id") AS all_ids
  FROM "purchase_quotation_items" GROUP BY "quotation_id", "item_id" HAVING COUNT(*) > 1
)
DELETE FROM "purchase_quotation_items" pqi
USING dup_groups dg
WHERE pqi."id" = ANY(dg.all_ids) AND pqi."id" <> dg.survivor_id;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "purchase_quotation_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_items_item_id" ON "purchase_quotation_items" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "purchase_request_item_id";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" DROP COLUMN "quantity_adjustment_reason";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "uq_purchase_quotation_items_quotation_item" UNIQUE("quotation_id","item_id");
