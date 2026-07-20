CREATE TYPE "public"."upload_type" AS ENUM('USER_AVATAR', 'MATERIAL_IMAGE', 'MATERIAL_DOCUMENT', 'PRODUCT_IMAGE');--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "type" "upload_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "image_url";