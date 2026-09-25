-- `docs/decisions/consumable-to-direct-rename.md` — đổi thuật ngữ CONSUMABLE→DIRECT. Viết tay theo mẫu
-- 0183: `ALTER TYPE ... RENAME VALUE` chỉ sửa một dòng `pg_enum`, giữ nguyên dữ liệu, không rewrite bảng;
-- SQL do `drizzle-kit generate` tự sinh sẽ dựng lại enum qua cast text và gãy ở các dòng còn nhãn cũ.
ALTER TYPE "public"."item_type"                    RENAME VALUE 'CONSUMABLE'          TO 'DIRECT';--> statement-breakpoint
ALTER TYPE "public"."bom_node_type"                RENAME VALUE 'CONSUMABLE'          TO 'DIRECT';--> statement-breakpoint
ALTER TYPE "public"."production_job_bom_item_type" RENAME VALUE 'CONSUMABLE'          TO 'DIRECT';--> statement-breakpoint
ALTER TYPE "public"."upload_type"                  RENAME VALUE 'CONSUMABLE_IMAGE'    TO 'DIRECT_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."upload_type"                  RENAME VALUE 'CONSUMABLE_DOCUMENT' TO 'DIRECT_DOCUMENT';--> statement-breakpoint

ALTER TABLE "items" RENAME COLUMN "consumable_grade" TO "direct_grade";--> statement-breakpoint

-- Dựng lại 3 CHECK tường minh thay vì tin Postgres tự render nhãn mới sau RENAME VALUE.
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_off_structure_consumable";--> statement-breakpoint
ALTER TABLE "production_job_bom_items" DROP CONSTRAINT "chk_production_job_bom_items_item_type";--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'DIRECT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL AND image_file_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL));--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_off_structure_direct" CHECK (NOT is_off_structure OR type = 'DIRECT');--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "chk_production_job_bom_items_item_type" CHECK (item_type IN ('FG', 'COMPONENT', 'DIRECT'));--> statement-breakpoint

-- `document_type` là varchar(50), không phải enum — data migration tay, giữ nguyên `current_value`
-- để không nhảy số mã tự sinh (VTxxxx/SPxxxx).
UPDATE "document_sequences" SET "document_type" = 'ITEM_DIRECT' WHERE "document_type" = 'ITEM_CONSUMABLE';
