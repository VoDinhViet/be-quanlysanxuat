CREATE TYPE "public"."outsourcing_order_status" AS ENUM('POSTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."outsourcing_receipt_status" AS ENUM('POSTED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
-- Remap dữ liệu cũ: `outsourcing_order_status` chỉ còn POSTED/CANCELLED (docs/decisions/
-- outsourcing-no-draft.md), không route nào tạo DRAFT/PENDING_* nữa — hàng nào lỡ còn ở các giá
-- trị đó (không phải POSTED) coi như chưa hoàn tất, remap về CANCELLED trước khi đổi kiểu cột.
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DATA TYPE "public"."outsourcing_order_status" USING (CASE "status" WHEN 'POSTED' THEN 'POSTED' ELSE 'CANCELLED' END)::"public"."outsourcing_order_status";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DEFAULT 'POSTED';--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
-- Remap dữ liệu cũ tương tự outsourcing_orders ở trên.
ALTER TABLE "outsourcing_receipts" ALTER COLUMN "status" SET DATA TYPE "public"."outsourcing_receipt_status" USING (CASE "status" WHEN 'POSTED' THEN 'POSTED' ELSE 'CANCELLED' END)::"public"."outsourcing_receipt_status";--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ALTER COLUMN "status" SET DEFAULT 'POSTED';