CREATE TYPE "public"."bom_node_type" AS ENUM('PART', 'RM');--> statement-breakpoint
ALTER TABLE "bom_items" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "type" "bom_node_type";--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "code" varchar(50);--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "name" varchar(255);--> statement-breakpoint

-- Data migration (xoá WIP, docs/decisions/wip-removal.md): backfill type/code/name/item_id theo
-- type của item hiện đang được trỏ tới — RM giữ nguyên item_id, mọi thứ khác (WIP) trở thành node
-- PART mang code/name copy từ chính item WIP đó, item_id về NULL.
UPDATE "bom_items" b SET
  "type"    = (CASE WHEN i."type" = 'RM' THEN 'RM' ELSE 'PART' END)::"bom_node_type",
  "code"    = CASE WHEN i."type" = 'RM' THEN NULL ELSE i."code" END,
  "name"    = CASE WHEN i."type" = 'RM' THEN NULL ELSE i."name" END,
  "item_id" = CASE WHEN i."type" = 'RM' THEN b."item_id" ELSE NULL END
FROM "items" i WHERE i."id" = b."item_id";