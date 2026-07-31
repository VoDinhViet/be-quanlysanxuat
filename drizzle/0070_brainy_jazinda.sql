CREATE TABLE "production_job_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"unit_qty" numeric(18, 3),
	"required_qty" numeric(18, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_production_job_materials_job_material" UNIQUE("production_job_id","material_id"),
	CONSTRAINT "chk_production_job_materials_qty" CHECK ((unit_qty IS NULL OR unit_qty > 0) AND required_qty > 0)
);
--> statement-breakpoint
CREATE TABLE "production_job_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_job_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "production_job_materials_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_materials" ADD CONSTRAINT "production_job_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_steps" ADD CONSTRAINT "production_job_steps_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_steps" ADD CONSTRAINT "production_job_steps_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_job_materials_material_id" ON "production_job_materials" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_steps_production_job_id" ON "production_job_steps" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_production_job_steps_operation_id" ON "production_job_steps" USING btree ("operation_id");