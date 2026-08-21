CREATE TABLE "production_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_production_job_items_item_code_name" UNIQUE("item_id","code","name")
);
--> statement-breakpoint
CREATE TABLE "production_job_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_production_job_units_unit_code_name" UNIQUE("unit_id","code","name")
);
--> statement-breakpoint
CREATE TABLE "production_job_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_id" uuid NOT NULL,
	"item_id" uuid,
	"production_job_item_id" uuid NOT NULL,
	"production_job_unit_id" uuid NOT NULL,
	"image_file_id" uuid,
	"unit_qty" numeric(18, 3),
	"required_qty" numeric(18, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_production_job_issues_job_item" UNIQUE("production_job_id","item_id"),
	CONSTRAINT "chk_production_job_issues_qty" CHECK ((unit_qty IS NULL OR unit_qty > 0) AND required_qty > 0)
);
--> statement-breakpoint
ALTER TABLE "production_job_items" ADD CONSTRAINT "production_job_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_units" ADD CONSTRAINT "production_job_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_issues" ADD CONSTRAINT "production_job_issues_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_issues" ADD CONSTRAINT "production_job_issues_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_issues" ADD CONSTRAINT "production_job_issues_production_job_item_id_production_job_items_id_fk" FOREIGN KEY ("production_job_item_id") REFERENCES "public"."production_job_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_issues" ADD CONSTRAINT "production_job_issues_production_job_unit_id_production_job_units_id_fk" FOREIGN KEY ("production_job_unit_id") REFERENCES "public"."production_job_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_issues" ADD CONSTRAINT "production_job_issues_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_issues_item_id" ON "production_job_issues" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_issues_production_job_item_id" ON "production_job_issues" USING btree ("production_job_item_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_issues_production_job_unit_id" ON "production_job_issues" USING btree ("production_job_unit_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_issues_image_file_id" ON "production_job_issues" USING btree ("image_file_id");--> statement-breakpoint
INSERT INTO "production_job_items" ("item_id", "code", "name")
SELECT DISTINCT m."item_id", m."material_code", m."material_name"
FROM "production_job_materials" m
WHERE m."item_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "production_job_units" ("unit_id", "code", "name")
SELECT DISTINCT u."id", m."unit_code", m."unit_name"
FROM "production_job_materials" m
JOIN "units" u ON u."code" = m."unit_code"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "production_job_issues" (
	"id", "production_job_id", "item_id", "production_job_item_id",
	"production_job_unit_id", "image_file_id", "unit_qty", "required_qty", "created_at"
)
SELECT m."id", m."production_job_id", m."item_id", pji."id", pju."id",
       m."image_file_id", m."unit_qty", m."required_qty", m."created_at"
FROM "production_job_materials" m
JOIN "production_job_items" pji
	ON pji."item_id" = m."item_id" AND pji."code" = m."material_code" AND pji."name" = m."material_name"
JOIN "units" u ON u."code" = m."unit_code"
JOIN "production_job_units" pju
	ON pju."unit_id" = u."id" AND pju."code" = m."unit_code" AND pju."name" = m."unit_name";--> statement-breakpoint
DROP TABLE "production_job_materials" CASCADE;