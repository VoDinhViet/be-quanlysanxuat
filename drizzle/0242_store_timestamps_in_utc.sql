-- Từ nay DB lưu giờ UTC (kết nối của app đặt TimeZone=UTC). Trước đó mọi cột `DEFAULT now()` chạy
-- trong phiên giờ VN nên chứa giờ VN (đọc ra lệch +7 giờ); trừ 7 giờ để về UTC.
-- `created_at` luôn do DB đặt nên luôn trừ. `updated_at` do hai nguồn ghi: code (`new Date()`, độ
-- chính xác mili-giây, đã là UTC, giữ nguyên) và DB (`now()`, độ chính xác micro-giây, giờ VN, phải
-- trừ). Nên trừ khi `updated_at` bằng `created_at` hoặc có phần dưới mili-giây; một giá trị DB tình
-- cờ tròn mili-giây (khoảng 1/1000) bị bỏ sót. Cả hai cột trừ trong cùng một câu UPDATE nên điều
-- kiện so với giá trị cũ.
-- Chạy khi app đã dừng và không chạy tay: app cũ ghi lại giờ VN sau khi dữ liệu đã dịch.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT created.table_name,
           EXISTS (
             SELECT 1
             FROM information_schema.columns updated
             WHERE updated.table_schema = created.table_schema
               AND updated.table_name = created.table_name
               AND updated.column_name = 'updated_at'
               AND updated.column_default = 'now()'
           ) AS has_updated_at_default
    FROM information_schema.columns created
    JOIN information_schema.tables base_table
      ON base_table.table_schema = created.table_schema
     AND base_table.table_name = created.table_name
     AND base_table.table_type = 'BASE TABLE'
    WHERE created.table_schema = 'public'
      AND created.column_name = 'created_at'
      AND created.column_default = 'now()'
      AND created.data_type = 'timestamp without time zone'
  LOOP
    IF target.has_updated_at_default THEN
      EXECUTE format(
        'UPDATE ONLY public.%I SET updated_at = CASE WHEN updated_at = created_at OR updated_at <> date_trunc(''milliseconds'', updated_at) THEN updated_at - interval ''7 hours'' ELSE updated_at END, created_at = created_at - interval ''7 hours''',
        target.table_name
      );
    ELSE
      EXECUTE format(
        'UPDATE ONLY public.%I SET created_at = created_at - interval ''7 hours''',
        target.table_name
      );
    END IF;
  END LOOP;
END $$;
