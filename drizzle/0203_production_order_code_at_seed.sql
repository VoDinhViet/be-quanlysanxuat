ALTER TABLE "production_orders" DROP CONSTRAINT "chk_production_orders_status_fields";--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_status_fields" CHECK ((status = 'PENDING' AND approved_at IS NULL)
          OR (status = 'APPROVED' AND code IS NOT NULL AND approved_at IS NOT NULL)
          OR (status = 'COMPLETED' AND code IS NOT NULL AND approved_at IS NOT NULL));--> statement-breakpoint
-- Backfill: LSX PENDING cũ chưa có mã → cấp LSXxxxx tuần tự theo created_at, rồi đẩy bộ đếm lên.
WITH pending AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM "production_orders"
  WHERE code IS NULL
), base AS (
  SELECT COALESCE(
    (SELECT current_value FROM "document_sequences" WHERE document_type = 'PRODUCTION_ORDER' AND year = 0),
    0
  ) AS v
), updated AS (
  UPDATE "production_orders" po
  SET code = 'LSX' || lpad((base.v + pending.rn)::text, 4, '0')
  FROM pending, base
  WHERE po.id = pending.id
  RETURNING po.id
)
INSERT INTO "document_sequences" (document_type, year, current_value)
SELECT 'PRODUCTION_ORDER', 0, base.v + (SELECT count(*) FROM updated)
FROM base
WHERE (SELECT count(*) FROM updated) > 0
ON CONFLICT (document_type, year) DO UPDATE SET current_value = EXCLUDED.current_value;
