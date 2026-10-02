-- Backfill `purchase_request_items.from_stock_qty` (cột thêm ở 0219, mặc định 0) cho dòng đề xuất
-- gắn Job tạo trước khi có cột: phần nhu cầu đã được tồn đáp ứng = nhu cầu Job − SL đề xuất mua.
-- Chỉ chạm dòng còn 0 và có phần dương nên chạy lại nhiều lần vẫn an toàn.
UPDATE "purchase_request_items" AS pri
SET "from_stock_qty" = round(pji."required_qty" - pri."quantity", 3)
FROM "purchase_requests" AS pr, "production_job_issues" AS pji
WHERE pr."id" = pri."purchase_request_id"
  AND pr."production_job_id" IS NOT NULL
  AND pji."production_job_id" = pr."production_job_id"
  AND pji."item_id" = pri."item_id"
  AND pri."from_stock_qty" = 0
  AND pji."required_qty" > pri."quantity";