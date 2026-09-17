ALTER TABLE "bom_items" DROP CONSTRAINT "chk_bom_items_node_shape";--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bom_items_unit_id" ON "bom_items" USING btree ("unit_id");--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)
        OR (type = 'ROOT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND parent_id IS NULL AND unit_id IS NULL));