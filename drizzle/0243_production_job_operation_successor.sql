-- Thêm `successor_id` (bước kế tiếp) cho công đoạn của Job và điền cho các Job đã có.
-- Luật điền giống `buildSuccessorIdByJobOperationId`: bước sau trong cùng node; hết thì bước đầu
-- của node cha gần nhất có công đoạn; node gốc (parent_id null) đi tới node `FG`; bước cuối của
-- `FG` không có bước kế tiếp. Tính từ các dòng công đoạn đang có nên Job sửa chữa từ NCR không
-- trỏ vào bước đã bị bỏ.
-- Cả file chạy trong một transaction: điền dữ liệu trước rồi mới thêm khoá ngoại và index để
-- tránh kiểm tra khoá và cập nhật index theo từng dòng. Job tạo ra giữa lúc deploy và lúc chạy
-- migration có thể còn null; chạy lại câu UPDATE là điền được vì nó tính lại cùng giá trị.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD COLUMN "successor_id" uuid;
--> statement-breakpoint
-- UNION (không phải UNION ALL) để dừng được nếu dữ liệu cha-con bị vòng.
WITH RECURSIVE first_operations AS (
  SELECT DISTINCT ON (production_job_bom_item_id)
    production_job_bom_item_id AS bom_item_id,
    id AS operation_id
  FROM production_job_operations
  ORDER BY production_job_bom_item_id, sort_order, created_at, id
),
ancestors AS (
  SELECT bom_item.id AS bom_item_id, COALESCE(bom_item.parent_id, fg_bom_item.id) AS ancestor_id
  FROM production_job_bom_items bom_item
  LEFT JOIN production_job_bom_items fg_bom_item
    ON fg_bom_item.production_job_id = bom_item.production_job_id
    AND fg_bom_item.item_type = 'FG'
    AND bom_item.item_type <> 'FG'
  UNION
  SELECT ancestors.bom_item_id, COALESCE(ancestor.parent_id, fg_bom_item.id)
  FROM ancestors
  JOIN production_job_bom_items ancestor ON ancestor.id = ancestors.ancestor_id
  LEFT JOIN production_job_bom_items fg_bom_item
    ON fg_bom_item.production_job_id = ancestor.production_job_id
    AND fg_bom_item.item_type = 'FG'
    AND ancestor.item_type <> 'FG'
  WHERE NOT EXISTS (
    SELECT 1 FROM first_operations WHERE first_operations.bom_item_id = ancestors.ancestor_id
  )
),
first_ancestor_operations AS (
  SELECT ancestors.bom_item_id, first_operations.operation_id
  FROM ancestors
  JOIN first_operations ON first_operations.bom_item_id = ancestors.ancestor_id
),
successors AS (
  SELECT
    job_operation.id,
    COALESCE(
      LEAD(job_operation.id) OVER (
        PARTITION BY job_operation.production_job_bom_item_id
        ORDER BY job_operation.sort_order, job_operation.created_at, job_operation.id
      ),
      first_ancestor_operations.operation_id
    ) AS successor_id
  FROM production_job_operations job_operation
  LEFT JOIN first_ancestor_operations
    ON first_ancestor_operations.bom_item_id = job_operation.production_job_bom_item_id
)
UPDATE production_job_operations
SET successor_id = successors.successor_id
FROM successors
WHERE successors.id = production_job_operations.id
  AND successors.successor_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_job_operations" ADD CONSTRAINT "production_job_operations_successor_id_production_job_operations_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."production_job_operations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_production_job_operations_successor_id" ON "production_job_operations" USING btree ("successor_id");
