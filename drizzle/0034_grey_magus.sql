CREATE TYPE "public"."operation_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('INHOUSE', 'OUTSOURCE');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('FG', 'WIP');--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "operation_type" DEFAULT 'INHOUSE' NOT NULL,
	"note" varchar(1000),
	"status" "operation_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "operations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "type" "product_type" DEFAULT 'FG' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;