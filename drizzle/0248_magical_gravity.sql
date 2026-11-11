-- Deploy chạy migration lúc app cũ còn sống: giới hạn thời gian chờ khoá để việc đổi cột không làm tắc
-- mọi câu đọc phiếu lãnh vật tư.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ALTER COLUMN "requisition_date" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ALTER COLUMN "requisition_date" SET DEFAULT now();--> statement-breakpoint
-- Phiếu cũ chỉ có ngày (00:00). Ngày trùng ngày tạo theo giờ VN thì lấy giờ tạo thật (UTC); phiếu ghi
-- lùi ngày thì lấy 00:00 giờ VN của ngày đó (= 17:00 UTC hôm trước).
UPDATE "inventory_requisitions"
SET "requisition_date" = CASE
  WHEN (("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = "requisition_date"::date
    THEN "created_at"
  ELSE "requisition_date" - interval '7 hours'
END;
