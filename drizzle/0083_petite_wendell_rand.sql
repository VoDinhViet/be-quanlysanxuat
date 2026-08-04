CREATE TABLE "bom_item_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"bom_item_id" uuid,
	"material_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_bom_item_materials_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
INSERT INTO "bom_item_materials"
  ("id", "bom_id", "bom_item_id", "material_id", "quantity", "sort_order", "note", "created_by", "created_at", "updated_at")
SELECT "id", "bom_id", "parent_id", "material_id", "quantity", "sort_order", "note", "created_by", "created_at", "updated_at"
FROM "bom_items" WHERE "item_type" = 'MATERIAL';--> statement-breakpoint
DELETE FROM "bom_items" WHERE "item_type" = 'MATERIAL';--> statement-breakpoint
ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_item_type_target";--> statement-breakpoint
ALTER TABLE "bom_items" DROP CONSTRAINT "bom_items_material_id_materials_id_fk";
--> statement-breakpoint
DROP INDEX "idx_bom_items_material_id";--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_item_materials" ADD CONSTRAINT "bom_item_materials_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_item_materials" ADD CONSTRAINT "bom_item_materials_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_item_materials" ADD CONSTRAINT "bom_item_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_item_materials" ADD CONSTRAINT "bom_item_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_item_materials_bom_id" ON "bom_item_materials" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "idx_bom_item_materials_bom_item_id" ON "bom_item_materials" USING btree ("bom_item_id");--> statement-breakpoint
CREATE INDEX "idx_bom_item_materials_material_id" ON "bom_item_materials" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_bom_item_materials_created_by" ON "bom_item_materials" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "bom_items" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "bom_items" DROP COLUMN "material_id";