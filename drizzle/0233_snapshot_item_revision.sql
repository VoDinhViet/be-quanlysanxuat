-- Chụp phiên bản (`revision`) của thành phẩm vào Job cùng lúc chụp BOM, để sửa `items.revision` sau
-- đó không làm Job đổi nhãn. Dữ liệu cũ không còn rev lúc tạo Job nên lấy rev hiện tại của sản phẩm.
-- `item_revision` còn nullable để app cũ (không gửi cột này) vẫn tạo được Job lúc deploy/rollback;
-- `NOT NULL` đặt ở migration sau khi app mới đã chạy.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "item_revision" varchar(50);--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ADD COLUMN "revision" varchar(50);--> statement-breakpoint
UPDATE "production_jobs" AS job
SET "item_revision" = item."revision"
FROM "items" AS item
WHERE item."id" = job."item_id";--> statement-breakpoint
UPDATE "production_job_bom_items" AS bom_item
SET "revision" = item."revision"
FROM "items" AS item
WHERE item."id" = bom_item."item_id";
