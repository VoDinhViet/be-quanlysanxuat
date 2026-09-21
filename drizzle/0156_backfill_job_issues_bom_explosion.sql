-- Custom SQL migration file, put your code below! --

-- BUG-086: production_job_issues.required_qty/unit_qty từng tính bằng SUM phẳng trên bom_items,
-- không nhân qua số lượng của các node WIP cha ở giữa (xem
-- docs/decisions/bom-explosion-in-job-demand.md). Backfill lại từ production_job_bom_items.
-- planned_quantity — cột đó đã đúng cho MỌI Job từ trước (migration 0125 backfill bằng
-- WITH RECURSIVE). Idempotent: tính lại từ nguồn, chạy nhiều lần cho cùng kết quả.
WITH demand AS (
  SELECT production_job_id, item_id, SUM(planned_quantity) AS required_qty
  FROM production_job_bom_items
  WHERE item_type = 'RM' AND item_id IS NOT NULL
  GROUP BY production_job_id, item_id
)
UPDATE production_job_issues i
SET required_qty = d.required_qty,
    unit_qty     = NULLIF(ROUND(d.required_qty / j.quantity, 3), 0)
FROM demand d
JOIN production_jobs j ON j.id = d.production_job_id
WHERE i.production_job_id = d.production_job_id
  AND i.item_id = d.item_id
  AND d.required_qty > 0;
