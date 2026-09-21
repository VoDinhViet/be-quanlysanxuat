-- `docs/decisions/material-to-consumable-rename.md` — đổi thuật ngữ Material→Consumable,
-- PART→Component. Hand-written thay cho SQL `drizzle-kit generate` tự sinh (drop+tạo lại enum,
-- cast qua text) — cách đó làm mọi dòng đang có giá trị cũ ('RM'/'PART'/'MATERIAL') gãy ngay ở
-- bước `USING type::text::item_type`, vì enum mới không còn nhãn đó. `ALTER TYPE ... RENAME
-- VALUE` chỉ sửa một dòng `pg_enum` đã commit — không rewrite bảng, an toàn trong transaction,
-- không mất dữ liệu, khác hẳn `ADD VALUE` (thứ đã buộc 0181/0182 phải tách 2 lượt migrate).
ALTER TYPE "public"."item_type"                    RENAME VALUE 'RM'   TO 'CONSUMABLE';--> statement-breakpoint
ALTER TYPE "public"."bom_node_type"                RENAME VALUE 'RM'   TO 'CONSUMABLE';--> statement-breakpoint
ALTER TYPE "public"."bom_node_type"                RENAME VALUE 'PART' TO 'COMPONENT';--> statement-breakpoint
ALTER TYPE "public"."production_job_bom_item_type" RENAME VALUE 'RM'   TO 'CONSUMABLE';--> statement-breakpoint
ALTER TYPE "public"."production_job_bom_item_type" RENAME VALUE 'PART' TO 'COMPONENT';--> statement-breakpoint
ALTER TYPE "public"."unit_scope"  RENAME VALUE 'MATERIAL'          TO 'CONSUMABLE';--> statement-breakpoint
ALTER TYPE "public"."upload_type" RENAME VALUE 'MATERIAL_IMAGE'    TO 'CONSUMABLE_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."upload_type" RENAME VALUE 'MATERIAL_DOCUMENT' TO 'CONSUMABLE_DOCUMENT';--> statement-breakpoint

ALTER TABLE "items" RENAME COLUMN "material_grade" TO "consumable_grade";--> statement-breakpoint

-- Dựng lại 2 CHECK tường minh thay vì tin Postgres tự render nhãn mới sau RENAME VALUE.
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)
        OR (type = 'ROOT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND parent_id IS NULL));--> statement-breakpoint

ALTER TABLE "production_job_bom_items" DROP CONSTRAINT "chk_production_job_bom_items_item_type";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "chk_production_job_bom_items_item_type"
  CHECK (item_type IN ('FG', 'COMPONENT', 'CONSUMABLE'));--> statement-breakpoint

-- `document_type` là varchar(50), không phải enum — data migration tay, giữ nguyên `current_value`
-- để không nhảy số mã tự sinh (VTxxxx/SPxxxx).
UPDATE "document_sequences" SET "document_type" = 'ITEM_CONSUMABLE' WHERE "document_type" = 'ITEM_RM';--> statement-breakpoint
UPDATE "document_sequences" SET "document_type" = 'ITEM_FG'         WHERE "document_type" = 'ITEM_FG_WIP';
