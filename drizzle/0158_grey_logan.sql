ALTER TYPE "public"."upload_type" ADD VALUE 'ITEM_DOCUMENT';--> statement-breakpoint
CREATE TABLE "item_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_item_files_item_file" UNIQUE("item_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "item_files" ADD CONSTRAINT "item_files_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_files" ADD CONSTRAINT "item_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_files_item_id" ON "item_files" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_item_files_file_id" ON "item_files" USING btree ("file_id");