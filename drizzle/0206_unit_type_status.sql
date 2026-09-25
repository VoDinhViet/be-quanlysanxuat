CREATE TYPE "public"."unit_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('QUANTITY', 'WEIGHT', 'LENGTH', 'VOLUME');--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "type" "unit_type" DEFAULT 'QUANTITY' NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "status" "unit_status" DEFAULT 'ACTIVE' NOT NULL;