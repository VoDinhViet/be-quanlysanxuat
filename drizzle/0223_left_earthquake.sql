-- Thêm trạng thái REJECTED (không duyệt) cho báo giá. Tạo lại enum thay vì ADD VALUE để backfill được
-- trong cùng transaction: báo giá bị từ chối trước đây lưu CANCELLED nhưng chưa từng được duyệt (approved_at NULL).
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."purchase_quotation_status" RENAME TO "purchase_quotation_status_old";--> statement-breakpoint
CREATE TYPE "public"."purchase_quotation_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DATA TYPE "public"."purchase_quotation_status" USING (
  CASE
    WHEN "status"::text = 'CANCELLED' AND "approved_at" IS NULL THEN 'REJECTED'
    ELSE "status"::text
  END
)::"public"."purchase_quotation_status";--> statement-breakpoint
ALTER TABLE "purchase_quotations" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"public"."purchase_quotation_status";--> statement-breakpoint
DROP TYPE "public"."purchase_quotation_status_old";
