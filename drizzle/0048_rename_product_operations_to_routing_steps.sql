-- Data-preserving rename: product_operations -> routing_steps, generalized from "routing keyed by
-- product_id only" to "routing keyed by product_id (Cấp 0 root) XOR bom_item_id (as-used node)".
-- Hand-written because drizzle-kit's table-rename disambiguation prompt requires a TTY.
ALTER TABLE "product_operations" RENAME TO "routing_steps";--> statement-breakpoint
ALTER TABLE "routing_steps" RENAME CONSTRAINT "product_operations_product_id_products_id_fk" TO "routing_steps_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "routing_steps" RENAME CONSTRAINT "product_operations_operation_id_operations_id_fk" TO "routing_steps_operation_id_operations_id_fk";--> statement-breakpoint
ALTER TABLE "routing_steps" RENAME CONSTRAINT "product_operations_created_by_credentials_id_fk" TO "routing_steps_created_by_credentials_id_fk";--> statement-breakpoint
ALTER INDEX "idx_product_operations_product_id" RENAME TO "idx_routing_steps_product_id";--> statement-breakpoint
ALTER INDEX "idx_product_operations_operation_id" RENAME TO "idx_routing_steps_operation_id";--> statement-breakpoint
ALTER INDEX "idx_product_operations_created_by" RENAME TO "idx_routing_steps_created_by";--> statement-breakpoint
ALTER TABLE "routing_steps" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_steps" ADD COLUMN "bom_item_id" uuid;--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_routing_steps_bom_item_id" ON "routing_steps" USING btree ("bom_item_id");--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "chk_routing_steps_target" CHECK ((product_id IS NOT NULL AND bom_item_id IS NULL) OR (product_id IS NULL AND bom_item_id IS NOT NULL));
