-- `docs/decisions/root-bom-item.md` — đưa Cấp 0 ("ROOT") thành một dòng bom_items thật, hợp nhất
-- routing Cấp 0 (`routings`/`routing_operations`) vào cùng bảng `bom_operations` mà PART đã dùng.
-- Hand-written (theo đúng tiền lệ 0085_rename_bom_item_materials_to_bom_materials.sql) vì cần xen
-- data migration giữa các bước DDL mà `drizzle-kit generate` không tự biết chèn. Phải chạy sau
-- 0181 (thêm giá trị enum 'ROOT') ở một transaction riêng — Postgres không cho dùng giá trị enum
-- mới thêm trong cùng transaction đã thêm nó.

-- 1. Bỏ constraint hình dạng cũ trước — nó chỉ cho phép PART/RM, chặn insert dòng ROOT bên dưới.
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint

-- 2. Bù `boms` header cho item có routing Cấp 0 nhưng chưa từng ghi dòng bom_items nào.
INSERT INTO "boms" ("id", "item_id", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), "r"."item_id", "r"."created_by", "r"."created_at", "r"."updated_at"
FROM "routings" "r"
WHERE NOT EXISTS (
  SELECT 1 FROM "boms" "b" WHERE "b"."item_id" = "r"."item_id"
);--> statement-breakpoint

-- 3. Một dòng ROOT cho mỗi bom hiện có (bao gồm cả bom vừa bù ở bước 2).
INSERT INTO "bom_items"
  ("id", "bom_id", "parent_id", "type", "item_id", "code", "name", "quantity", "level",
   "sort_order", "note", "drawing_file_id", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), "b"."id", NULL, 'ROOT', "b"."item_id", NULL, NULL, 1, 0, 0,
       NULL, NULL, "b"."created_by", "b"."created_at", "b"."updated_at"
FROM "boms" "b"
WHERE NOT EXISTS (
  SELECT 1 FROM "bom_items" "bi" WHERE "bi"."bom_id" = "b"."id" AND "bi"."type" = 'ROOT'
);--> statement-breakpoint

-- 4. Repoint mọi dòng top-level cũ (parent_id NULL, không phải ROOT) về đúng dòng ROOT cùng bom.
UPDATE "bom_items" "child"
SET "parent_id" = "root"."id"
FROM "bom_items" "root"
WHERE "root"."bom_id" = "child"."bom_id"
  AND "root"."type" = 'ROOT'
  AND "child"."parent_id" IS NULL
  AND "child"."type" <> 'ROOT';--> statement-breakpoint

-- 5. Chuyển routing_operations -> bom_operations, gắn vào dòng ROOT tương ứng. Giữ nguyên id gốc
--    (không randomize lại) để không ai phải remap tham chiếu ngoài nếu có.
INSERT INTO "bom_operations"
  ("id", "bom_item_id", "operation_id", "type", "sort_order", "note", "created_by",
   "created_at", "updated_at")
SELECT "ro"."id", "bi"."id", "ro"."operation_id", "ro"."type", "ro"."sort_order", "ro"."note",
       "ro"."created_by", "ro"."created_at", "ro"."updated_at"
FROM "routing_operations" "ro"
JOIN "routings" "r" ON "r"."id" = "ro"."routing_id"
JOIN "boms" "b" ON "b"."item_id" = "r"."item_id"
JOIN "bom_items" "bi" ON "bi"."bom_id" = "b"."id" AND "bi"."type" = 'ROOT';--> statement-breakpoint

-- 6. Dọn bảng cũ — dữ liệu đã di dời hết ở bước 5.
ALTER TABLE "routings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_operations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "routings" CASCADE;--> statement-breakpoint
DROP TABLE "routing_operations" CASCADE;--> statement-breakpoint

-- 7. Index lại cho hình dạng mới — mọi node khác ROOT giờ luôn có parent_id thật (bước 4), không
--    còn cần tách theo NULL ≠ NULL của Postgres như trước.
DROP INDEX "uq_bom_items_bom_item_no_parent";--> statement-breakpoint
DROP INDEX "uq_bom_items_bom_parent_item";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_root" ON "bom_items" USING btree ("bom_id") WHERE type = 'ROOT';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_parent_item" ON "bom_items" USING btree ("bom_id","parent_id","item_id");--> statement-breakpoint

-- 8. Constraint hình dạng mới (3 nhánh, thêm ROOT).
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'RM' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL)
        OR (type = 'PART' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)
        OR (type = 'ROOT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND parent_id IS NULL));
