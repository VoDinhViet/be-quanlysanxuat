ALTER TABLE "production_job_bom_items" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
UPDATE "production_job_bom_items" b
SET "image_file_id" = i."image_file_id"
FROM "items" i
WHERE i."id" = b."item_id" AND i."image_file_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_image_file_id" ON "production_job_bom_items" USING btree ("image_file_id");