-- Pure rename: routing_steps -> product_operations (reverting migration 0048's rename in the other
-- direction — this table's original name, before it briefly became `routing_steps`). No data loss,
-- every row keeps its id. Hand-written because drizzle-kit's table-rename disambiguation prompt
-- requires a TTY (same reason as 0085_rename_bom_item_materials_to_bom_materials.sql).
--
-- Live constraint/index names were introspected before writing this — some NOT NULL/PK constraints
-- already read `product_operations_*` (Postgres never renamed them back when 0048 renamed the table
-- to `routing_steps`), so only the constraints/indexes that still say `routing_steps_*` need fixing.
ALTER TABLE "routing_steps" RENAME TO "product_operations";--> statement-breakpoint
ALTER TABLE "product_operations" RENAME CONSTRAINT "routing_steps_product_id_not_null" TO "product_operations_product_id_not_null";--> statement-breakpoint
ALTER TABLE "product_operations" RENAME CONSTRAINT "routing_steps_created_by_users_id_fk" TO "product_operations_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "product_operations" RENAME CONSTRAINT "routing_steps_operation_id_operations_id_fk" TO "product_operations_operation_id_operations_id_fk";--> statement-breakpoint
ALTER TABLE "product_operations" RENAME CONSTRAINT "routing_steps_product_id_products_id_fk" TO "product_operations_product_id_products_id_fk";--> statement-breakpoint
ALTER INDEX "idx_routing_steps_created_by" RENAME TO "idx_product_operations_created_by";--> statement-breakpoint
ALTER INDEX "idx_routing_steps_operation_id" RENAME TO "idx_product_operations_operation_id";--> statement-breakpoint
ALTER INDEX "idx_routing_steps_product_id" RENAME TO "idx_product_operations_product_id";
