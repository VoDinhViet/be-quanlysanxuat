ALTER TYPE "public"."upload_type" ADD VALUE 'BOM_ITEM_IMAGE';--> statement-breakpoint
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_items_image_file_id" ON "bom_items" USING btree ("image_file_id");--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL AND image_file_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)
        OR (type = 'ROOT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND parent_id IS NULL AND unit_id IS NULL AND image_file_id IS NULL));