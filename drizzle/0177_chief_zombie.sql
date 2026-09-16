ALTER TABLE "bom_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "chk_bom_items_node_shape" CHECK ((type = 'RM' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL)
        OR (type = 'PART' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL));--> statement-breakpoint

-- Data migration (xoá WIP, docs/decisions/wip-removal.md): dọn item WIP mồ côi. An toàn vì
-- bom_items.item_id của mọi node PART đã về NULL ở migration trước, và các bảng giao dịch
-- (orders/production_jobs/kho...) đã được TRUNCATE trước đợt migration này
-- (pnpm db:reset:transactions).
DELETE FROM "bom_operations" WHERE "bom_item_id" IN (
  SELECT bi."id" FROM "bom_items" bi
  JOIN "boms" b ON b."id" = bi."bom_id"
  JOIN "items" i ON i."id" = b."item_id"
  WHERE i."type" = 'WIP'
);--> statement-breakpoint
DELETE FROM "boms" WHERE "item_id" IN (SELECT "id" FROM "items" WHERE "type" = 'WIP');--> statement-breakpoint
DELETE FROM "routings" WHERE "item_id" IN (SELECT "id" FROM "items" WHERE "type" = 'WIP');--> statement-breakpoint
DELETE FROM "item_files" WHERE "item_id" IN (SELECT "id" FROM "items" WHERE "type" = 'WIP');--> statement-breakpoint
DELETE FROM "item_units" WHERE "item_id" IN (SELECT "id" FROM "items" WHERE "type" = 'WIP');--> statement-breakpoint
UPDATE "items" SET "cloned_from_item_id" = NULL
  WHERE "cloned_from_item_id" IN (SELECT "id" FROM "items" WHERE "type" = 'WIP');--> statement-breakpoint
DELETE FROM "items" WHERE "type" = 'WIP';