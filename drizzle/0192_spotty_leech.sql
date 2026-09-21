ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_operations" ADD COLUMN "bom_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_operations" ALTER COLUMN "bom_item_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "bom_operations" o SET "bom_id" = r."bom_id", "bom_item_id" = NULL FROM "bom_items" r WHERE o."bom_item_id" = r."id" AND r."type" = 'ROOT';--> statement-breakpoint
UPDATE "bom_items" SET "parent_id" = NULL WHERE "parent_id" IN (SELECT "id" FROM "bom_items" WHERE "type" = 'ROOT');--> statement-breakpoint
DELETE FROM "bom_items" WHERE "type" = 'ROOT';--> statement-breakpoint
DROP INDEX "uq_bom_items_bom_root";--> statement-breakpoint
DROP INDEX "uq_bom_items_bom_parent_item";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_item_no_parent" ON "bom_items" USING btree ("bom_id","item_id") WHERE parent_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_parent_item" ON "bom_items" USING btree ("bom_id","parent_id","item_id") WHERE parent_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL AND image_file_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL));--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "chk_bom_operations_anchor" CHECK ((bom_id IS NULL) <> (bom_item_id IS NULL));--> statement-breakpoint
CREATE INDEX "idx_bom_operations_bom_id" ON "bom_operations" USING btree ("bom_id");--> statement-breakpoint
ALTER TABLE "boms" ADD COLUMN "note" varchar(1000);
