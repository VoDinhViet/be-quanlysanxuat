CREATE TYPE "public"."academic_catalog_node_type" AS ENUM('SCHOOL_LEVEL', 'GRADE', 'MAJOR', 'SUBJECT');--> statement-breakpoint
CREATE TABLE "academic_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"type" "academic_catalog_node_type" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "academic_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "academic_catalog" ADD CONSTRAINT "academic_catalog_parent_id_academic_catalog_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."academic_catalog"("id") ON DELETE cascade ON UPDATE no action;
