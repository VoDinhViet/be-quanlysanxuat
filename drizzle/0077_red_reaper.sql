ALTER TABLE "production_job_bom_items" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Data migration (hand-added): backfill `level` theo độ sâu thật, cả hai cây từng bị tính lại lúc
-- đọc thay vì đọc cột lưu, nên có thể đã lệch. Idempotent — chạy lại là no-op.
WITH RECURSIVE tree AS (
  SELECT id, 1 AS lvl FROM bom_items WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.lvl + 1 FROM bom_items c JOIN tree t ON c.parent_id = t.id
)
UPDATE bom_items b SET level = t.lvl FROM tree t WHERE b.id = t.id AND b.level <> t.lvl;
--> statement-breakpoint
WITH RECURSIVE tree AS (
  SELECT id, 1 AS lvl FROM production_job_bom_items WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.lvl + 1 FROM production_job_bom_items c JOIN tree t ON c.parent_id = t.id
)
UPDATE production_job_bom_items b SET level = t.lvl FROM tree t WHERE b.id = t.id AND b.level <> t.lvl;