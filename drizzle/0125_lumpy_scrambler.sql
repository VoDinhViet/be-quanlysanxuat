ALTER TABLE "production_job_bom_items" ADD COLUMN "planned_quantity" numeric(18, 3);
--> statement-breakpoint
WITH RECURSIVE tree AS (
  SELECT b.id, j.quantity * b.quantity AS planned
  FROM production_job_bom_items b
  JOIN production_jobs j ON j.id = b.production_job_id
  WHERE b.parent_id IS NULL
  UNION ALL
  SELECT c.id, t.planned * c.quantity
  FROM production_job_bom_items c
  JOIN tree t ON t.id = c.parent_id
)
UPDATE production_job_bom_items b SET planned_quantity = t.planned
FROM tree t WHERE t.id = b.id;
--> statement-breakpoint
ALTER TABLE "production_job_bom_items" ALTER COLUMN "planned_quantity" SET NOT NULL;
