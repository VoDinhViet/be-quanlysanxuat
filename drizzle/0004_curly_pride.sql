ALTER TABLE "clients" ALTER COLUMN "client_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "client_type" SET DEFAULT 'INDIVIDUAL'::text;--> statement-breakpoint
DROP TYPE "public"."client_type";--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('INDIVIDUAL', 'COMPANY');--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "client_type" SET DEFAULT 'INDIVIDUAL'::"public"."client_type";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "client_type" SET DATA TYPE "public"."client_type" USING upper("client_type")::"public"."client_type";
