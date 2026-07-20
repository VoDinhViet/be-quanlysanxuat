CREATE TYPE "public"."file_kind" AS ENUM('IMAGE', 'DOCUMENT');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mimetype" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"checksum" varchar(64),
	"kind" "file_kind" NOT NULL,
	"storage_driver" varchar(20) DEFAULT 'local' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_attachments" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_credentials_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD CONSTRAINT "material_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_attachments" ADD CONSTRAINT "supplier_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;