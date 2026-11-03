-- Xoá số PO đã chép vào `purchase_requests.note` lúc tạo đề xuất thiếu vật tư: số PO giờ đọc từ đơn
-- qua LSX, bản chép khiến màn hình và bản in giữ số cũ khi đơn đổi PO.
-- Chỉ xoá `note` trùng đúng số PO hiện tại của đơn. `note` khác đi được giữ vì không phân biệt được
-- số PO cũ với lý do người dùng tự nhập (`orders` không lưu lịch sử PO).
-- Không đụng `updated_at` vì người dùng không sửa gì trên phiếu.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
UPDATE "purchase_requests" AS "request"
SET "note" = NULL
FROM "production_orders" AS "production_order"
INNER JOIN "orders" AS "sales_order" ON "sales_order"."id" = "production_order"."order_id"
WHERE "production_order"."id" = "request"."production_order_id"
  AND "request"."note" = "sales_order"."buyer_po_no";
