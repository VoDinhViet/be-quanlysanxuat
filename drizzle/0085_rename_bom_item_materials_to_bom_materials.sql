-- Data-preserving rename: bom_item_materials -> bom_materials, dropping the Cấp 0 case (bom_id,
-- bom_item_id nullable) in favor of always-required bom_item_id — a material line must now attach
-- to an existing bom_items node. Deletes the 14 orphaned Cấp 0 rows (bom_item_id IS NULL) that can
-- no longer satisfy the new NOT NULL constraint (seed data only, from the retired
-- ensureWipMaterialBom seed helper).
-- Hand-written because drizzle-kit's table-rename disambiguation prompt requires a TTY.
DELETE FROM "bom_item_materials" WHERE "bom_item_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bom_item_materials" RENAME TO "bom_materials";--> statement-breakpoint
ALTER TABLE "bom_materials" RENAME CONSTRAINT "bom_item_materials_pkey" TO "bom_materials_pkey";--> statement-breakpoint
ALTER TABLE "bom_materials" RENAME CONSTRAINT "bom_item_materials_bom_item_id_bom_items_id_fk" TO "bom_materials_bom_item_id_bom_items_id_fk";--> statement-breakpoint
ALTER TABLE "bom_materials" RENAME CONSTRAINT "bom_item_materials_material_id_materials_id_fk" TO "bom_materials_material_id_materials_id_fk";--> statement-breakpoint
ALTER TABLE "bom_materials" RENAME CONSTRAINT "bom_item_materials_created_by_users_id_fk" TO "bom_materials_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "bom_materials" RENAME CONSTRAINT "chk_bom_item_materials_quantity_positive" TO "chk_bom_materials_quantity_positive";--> statement-breakpoint
ALTER INDEX "idx_bom_item_materials_bom_item_id" RENAME TO "idx_bom_materials_bom_item_id";--> statement-breakpoint
ALTER INDEX "idx_bom_item_materials_material_id" RENAME TO "idx_bom_materials_material_id";--> statement-breakpoint
ALTER INDEX "idx_bom_item_materials_created_by" RENAME TO "idx_bom_materials_created_by";--> statement-breakpoint
DROP INDEX "idx_bom_item_materials_bom_id";--> statement-breakpoint
ALTER TABLE "bom_materials" DROP CONSTRAINT "bom_item_materials_bom_id_boms_id_fk";--> statement-breakpoint
ALTER TABLE "bom_materials" DROP COLUMN "bom_id";--> statement-breakpoint
ALTER TABLE "bom_materials" ALTER COLUMN "bom_item_id" SET NOT NULL;
