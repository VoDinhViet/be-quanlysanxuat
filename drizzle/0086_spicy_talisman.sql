CREATE TABLE "bom_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_item_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Data-preserving split: routing_steps' as-used rows (bom_item_id IS NOT NULL) move to the new
-- bom_operations table, keeping their original id — routing_steps keeps only Cấp 0 rows
-- (product_id IS NOT NULL) afterward. Hand-written, same pattern as
-- 0085_rename_bom_item_materials_to_bom_materials.sql.
INSERT INTO "bom_operations" ("id", "bom_item_id", "operation_id", "sort_order", "note", "created_by", "created_at", "updated_at")
SELECT "id", "bom_item_id", "operation_id", "sort_order", "note", "created_by", "created_at", "updated_at"
FROM "routing_steps" WHERE "bom_item_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "routing_steps" WHERE "bom_item_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_steps" DROP CONSTRAINT "chk_routing_steps_target";--> statement-breakpoint
ALTER TABLE "routing_steps" DROP CONSTRAINT "routing_steps_bom_item_id_bom_items_id_fk";
--> statement-breakpoint
DROP INDEX "idx_bom_items_path";--> statement-breakpoint
DROP INDEX "idx_routing_steps_bom_item_id";--> statement-breakpoint
ALTER TABLE "routing_steps" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_operations_bom_item_id" ON "bom_operations" USING btree ("bom_item_id");--> statement-breakpoint
CREATE INDEX "idx_bom_operations_operation_id" ON "bom_operations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_bom_operations_created_by" ON "bom_operations" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "bom_items" DROP COLUMN "path";--> statement-breakpoint
ALTER TABLE "routing_steps" DROP COLUMN "bom_item_id";
