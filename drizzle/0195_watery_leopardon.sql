-- `chk_bom_items_node_shape` bake sẵn cast `::bom_node_type` trên các literal so sánh với `type`
-- (Postgres tự thêm lúc tạo CHECK) — phải drop trước khi đổi kiểu cột, nếu không
-- `ALTER COLUMN ... SET DATA TYPE text` sẽ validate lại CHECK và vỡ vì so `text = bom_node_type`.
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."bom_node_type";--> statement-breakpoint
CREATE TYPE "public"."bom_node_type" AS ENUM('COMPONENT', 'CONSUMABLE');--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "type" SET DATA TYPE "public"."bom_node_type" USING "type"::"public"."bom_node_type";--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
      AND unit_id IS NULL AND image_file_id IS NULL)
    OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL));