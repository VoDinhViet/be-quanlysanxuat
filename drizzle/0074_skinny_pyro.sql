CREATE TABLE "production_job_bom_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_id" uuid NOT NULL,
	"parent_id" uuid,
	"item_type" "bom_item_type" NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"material_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_production_job_bom_items_item_type_target" CHECK ((item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)),
	CONSTRAINT "chk_production_job_bom_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "production_job_materials" DROP CONSTRAINT "production_job_materials_material_id_materials_id_fk";
--> statement-breakpoint
ALTER TABLE "production_job_materials" ALTER COLUMN "material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "material_code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "material_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "unit_code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "unit_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "production_job_steps" ADD COLUMN "production_job_bom_item_id" uuid;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_parent_id_production_job_bom_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."production_job_bom_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD CONSTRAINT "production_job_bom_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_production_job_id" ON "production_job_bom_items" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_parent_id" ON "production_job_bom_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_product_id" ON "production_job_bom_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_bom_items_material_id" ON "production_job_bom_items" USING btree ("material_id");--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "production_job_materials_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "production_job_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_steps" ADD CONSTRAINT "production_job_steps_production_job_bom_item_id_production_job_bom_items_id_fk" FOREIGN KEY ("production_job_bom_item_id") REFERENCES "public"."production_job_bom_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_materials_image_file_id" ON "production_job_materials" USING btree ("image_file_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_steps_production_job_bom_item_id" ON "production_job_steps" USING btree ("production_job_bom_item_id");