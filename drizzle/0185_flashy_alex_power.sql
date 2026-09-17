ALTER TABLE "bom_items" DROP CONSTRAINT "bom_items_drawing_file_id_files_id_fk";
--> statement-breakpoint
DROP INDEX "idx_bom_items_drawing_file_id";--> statement-breakpoint
ALTER TABLE "bom_items" DROP COLUMN "drawing_file_id";