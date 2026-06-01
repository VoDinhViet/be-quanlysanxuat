CREATE TYPE "public"."product_file_type" AS ENUM('thumbnail', 'technical_attachment');--> statement-breakpoint
ALTER TABLE "product_files" ADD COLUMN "file_type" "product_file_type" DEFAULT 'thumbnail' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_sale_price" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_code_unique_idx" ON "orders" USING btree ("code");