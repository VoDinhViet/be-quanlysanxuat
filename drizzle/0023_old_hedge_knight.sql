ALTER TABLE "materials" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "type" SET DEFAULT 'INTERNAL'::text;--> statement-breakpoint
DROP TYPE "public"."material_type";--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('INTERNAL', 'CLIENT');--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "type" SET DEFAULT 'INTERNAL'::"public"."material_type";--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "type" SET DATA TYPE "public"."material_type" USING "type"::"public"."material_type";