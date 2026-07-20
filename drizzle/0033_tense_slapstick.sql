ALTER TYPE "public"."upload_type" ADD VALUE 'PRODUCT_DOCUMENT' BEFORE 'SUPPLIER_LOGO';--> statement-breakpoint
CREATE TABLE "product_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_attachments_product_id" ON "product_attachments" USING btree ("product_id");