-- Legacy attachment rows only ever had url/filename/mimetype/size (no file_id link into the new
-- `files` registry) and are discarded per the upload-system rebuild decision — there is no
-- backfill path from a bare URL back to a registry row. Clear them before the column becomes
-- required, otherwise the NOT NULL below fails against any pre-existing row.
DELETE FROM "material_attachments" WHERE "file_id" IS NULL;--> statement-breakpoint
DELETE FROM "supplier_attachments" WHERE "file_id" IS NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ALTER COLUMN "file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_attachments" ALTER COLUMN "file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "material_attachments" DROP COLUMN "filename";--> statement-breakpoint
ALTER TABLE "material_attachments" DROP COLUMN "mimetype";--> statement-breakpoint
ALTER TABLE "material_attachments" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "supplier_attachments" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "supplier_attachments" DROP COLUMN "filename";--> statement-breakpoint
ALTER TABLE "supplier_attachments" DROP COLUMN "mimetype";--> statement-breakpoint
ALTER TABLE "supplier_attachments" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "suppliers" DROP COLUMN "logo_url";