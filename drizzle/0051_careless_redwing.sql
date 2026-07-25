ALTER TYPE "public"."upload_type" ADD VALUE 'BOM_ITEM_DRAWING';--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "drawing_file_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_drawing_file_id_files_id_fk" FOREIGN KEY ("drawing_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_items_drawing_file_id" ON "bom_items" USING btree ("drawing_file_id");