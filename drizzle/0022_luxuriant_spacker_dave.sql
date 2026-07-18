CREATE TYPE "public"."material_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('INTERNAL', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "material_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "material_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "material_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mimetype" varchar(100),
	"size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"unit_id" uuid NOT NULL,
	"material_group_id" uuid NOT NULL,
	"type" "material_type" DEFAULT 'INTERNAL' NOT NULL,
	"client_id" uuid,
	"image_url" varchar(500),
	"status" "material_status" DEFAULT 'ACTIVE' NOT NULL,
	"note" varchar(1000),
	"material_grade" varchar(255),
	"technical_standard" varchar(255),
	"dimensions" varchar(255),
	"specific_weight" numeric(12, 3),
	"color_surface" varchar(255),
	"description" varchar(2000),
	"origin" varchar(255),
	"preferred_supplier_id" uuid,
	"lead_time" varchar(100),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "materials_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "material_attachments" ADD CONSTRAINT "material_attachments_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_logs" ADD CONSTRAINT "material_logs_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_logs" ADD CONSTRAINT "material_logs_changed_by_credentials_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_material_group_id_material_groups_id_fk" FOREIGN KEY ("material_group_id") REFERENCES "public"."material_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_material_attachments_material_id" ON "material_attachments" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_material_logs_material_id" ON "material_logs" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_materials_material_group_id" ON "materials" USING btree ("material_group_id");--> statement-breakpoint
CREATE INDEX "idx_materials_client_id" ON "materials" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_materials_status" ON "materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_materials_type" ON "materials" USING btree ("type");