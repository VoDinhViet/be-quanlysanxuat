ALTER TABLE "items" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "type" SET DEFAULT 'FG'::text;--> statement-breakpoint
DROP TYPE "public"."item_type";--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('FG', 'RM');--> statement-breakpoint

-- Data migration (xoá WIP, docs/decisions/wip-removal.md): lưới an toàn — migration 0177 đã xoá mọi
-- item WIP, nhưng nếu còn sót thì cast cuối sẽ fail vì enum mới không có giá trị đó.
UPDATE "items" SET "type" = 'FG' WHERE "type" = 'WIP';--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "type" SET DEFAULT 'FG'::"public"."item_type";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "type" SET DATA TYPE "public"."item_type" USING "type"::"public"."item_type";