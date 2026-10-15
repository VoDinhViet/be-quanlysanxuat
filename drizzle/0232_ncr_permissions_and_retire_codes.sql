-- Cấp quyền NCR cho các role đang làm OQC, và gỡ hai mã đã retired khỏi mọi role (kể cả role xoá mềm)
-- để `RolesService.onModuleInit` không còn cảnh báo mã lạ.
--   oqc:read   -> ncr:read
--   oqc:update -> ncr:create, ncr:update
-- Không dựa vào `oqc:create`: đó là quyền bên sản xuất xin OQC (`POST /production-jobs/:jobId/qc`), mà
-- `ncr:update` cho phép tạo lệnh sản xuất đã duyệt sẵn và sửa dự toán chi phí NCR.
-- `ncr:approve` và `ncr:delete` không tự cấp: người duyệt được tick tay ở màn hình phân quyền.
-- Mã retired: mọi `qc-aql:*` và `inventory-requisitions:issue`.
-- Idempotent: chỉ thêm mã còn thiếu và chỉ lọc role còn chứa mã retired, chạy lại không đổi gì.
UPDATE roles
SET permissions = permissions || '["ncr:read"]'::jsonb, updated_at = now()
WHERE permissions ? 'oqc:read' AND NOT permissions ? 'ncr:read';
--> statement-breakpoint
UPDATE roles
SET permissions = permissions || '["ncr:create"]'::jsonb, updated_at = now()
WHERE permissions ? 'oqc:update' AND NOT permissions ? 'ncr:create';
--> statement-breakpoint
UPDATE roles
SET permissions = permissions || '["ncr:update"]'::jsonb, updated_at = now()
WHERE permissions ? 'oqc:update' AND NOT permissions ? 'ncr:update';
--> statement-breakpoint
UPDATE roles
SET permissions = jsonb_path_query_array(
      permissions,
      '$[*] ? (!(@ starts with "qc-aql:") && @ != "inventory-requisitions:issue")'
    ),
    updated_at = now()
WHERE permissions @? '$[*] ? (@ starts with "qc-aql:" || @ == "inventory-requisitions:issue")';
