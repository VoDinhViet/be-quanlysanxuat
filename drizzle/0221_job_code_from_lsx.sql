-- Đổi mã Job cũ `JOB0001` sang quy tắc mới `xx-yyyyy-zzz` (PH-81): `xx` 2 số cuối của năm duyệt LSX
-- (giờ VN), `yyyyy` số trong mã LSX (`LSX0011` → `00011`), `zzz` thứ tự Job trong LSX theo thứ tự
-- mã cũ (mã cũ cấp liên tiếp trong một lượt duyệt nên giữ đúng thứ tự tạo). Chỉ đụng mã còn dạng
-- `JOB…` nên chạy lại nhiều lần vẫn an toàn.
UPDATE "production_jobs" AS pj
SET "code" = to_char(coalesce(po."approved_at", pj."created_at") AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YY')
             || '-' || lpad(regexp_replace(po."code", '\D', '', 'g'), 5, '0')
             || '-' || lpad(n.seq::text, 3, '0')
FROM "production_orders" AS po,
     (SELECT "id", row_number() OVER (PARTITION BY "production_order_id" ORDER BY "code", "id") AS seq
        FROM "production_jobs") AS n
WHERE po."id" = pj."production_order_id"
  AND n."id" = pj."id"
  AND pj."code" ~ '^JOB[0-9]+$';--> statement-breakpoint
-- Bộ đếm Job theo thứ tự toàn cục không còn dùng (mã Job giờ ghép từ mã LSX).
DELETE FROM "document_sequences" WHERE "document_type" = 'PRODUCTION_JOB';
