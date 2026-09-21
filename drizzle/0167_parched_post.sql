ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DEFAULT 'SENT'::text;--> statement-breakpoint
DROP TYPE "public"."outsourcing_order_status";--> statement-breakpoint
CREATE TYPE "public"."outsourcing_order_status" AS ENUM('SENT', 'PARTIAL', 'WAITING_QC', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DEFAULT 'SENT'::"public"."outsourcing_order_status";--> statement-breakpoint
-- Backfill dữ liệu: mọi dòng đang 'POSTED' (giá trị cũ, không còn hợp lệ trong enum mới) phải suy
-- ra đúng 1 trong 4 giá trị mới trước khi cast — cùng logic recomputeOutsourcingOrderStatus()
-- (src/api/outsourcing-orders/outsourcing-orders.query.ts). CANCELLED giữ nguyên, không đụng.
WITH order_totals AS (
  SELECT
    oo.id AS outsourcing_order_id,
    COALESCE(SUM(ooi.quantity), 0) AS sent_quantity,
    COALESCE((
      SELECT SUM(ori.quantity)
      FROM outsourcing_order_items ooi2
      JOIN outsourcing_receipt_items ori ON ori.outsourcing_order_item_id = ooi2.id
      JOIN outsourcing_receipts orr ON orr.id = ori.outsourcing_receipt_id AND orr.status = 'POSTED'
      WHERE ooi2.outsourcing_order_id = oo.id
    ), 0) AS received_quantity,
    EXISTS (
      SELECT 1
      FROM outsourcing_order_items ooi3
      JOIN outsourcing_receipt_items ori2 ON ori2.outsourcing_order_item_id = ooi3.id
      JOIN outsourcing_receipts orr2 ON orr2.id = ori2.outsourcing_receipt_id AND orr2.status = 'POSTED'
      JOIN quality_inspections qi ON qi.origin_type = 'OUTSOURCING_RECEIPT_ITEM'
        AND qi.origin_id = ori2.id
        AND qi.inspection_type = 'IQC'
        AND qi.status <> 'COMPLETED'
      WHERE ooi3.outsourcing_order_id = oo.id
    ) AS has_pending_iqc
  FROM outsourcing_orders oo
  LEFT JOIN outsourcing_order_items ooi ON ooi.outsourcing_order_id = oo.id
  WHERE oo.status = 'POSTED'
  GROUP BY oo.id
)
UPDATE outsourcing_orders o
SET status = CASE
  WHEN t.received_quantity < t.sent_quantity AND t.received_quantity > 0 THEN 'PARTIAL'
  WHEN t.received_quantity < t.sent_quantity THEN 'SENT'
  WHEN t.has_pending_iqc THEN 'WAITING_QC'
  ELSE 'COMPLETED'
END
FROM order_totals t
WHERE o.id = t.outsourcing_order_id;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DATA TYPE "public"."outsourcing_order_status" USING "status"::"public"."outsourcing_order_status";