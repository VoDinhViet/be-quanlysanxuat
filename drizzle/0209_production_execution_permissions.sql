-- Custom SQL migration file, put your code below! --

-- Tách nhóm quyền `production-execution` khỏi `production:*` (màn "Thực hiện sản xuất"). Cấp mã mới
-- cho các role đang dùng màn này để không ai bị mất quyền sau khi deploy:
--   production:read              -> production-execution:read
--   production:update            -> production-execution:report
--   production:approve / :create -> production-execution:read-all (điều độ/quản lý, không bị giới
--                                   hạn theo công đoạn được phân công)
-- Idempotent: chỉ thêm mã còn thiếu, chạy lại không đổi gì.
UPDATE roles
SET permissions = permissions || '["production-execution:read"]'::jsonb, updated_at = now()
WHERE permissions ? 'production:read' AND NOT permissions ? 'production-execution:read';
--> statement-breakpoint
UPDATE roles
SET permissions = permissions || '["production-execution:report"]'::jsonb, updated_at = now()
WHERE permissions ? 'production:update' AND NOT permissions ? 'production-execution:report';
--> statement-breakpoint
UPDATE roles
SET permissions = permissions || '["production-execution:read-all"]'::jsonb, updated_at = now()
WHERE (permissions ? 'production:approve' OR permissions ? 'production:create')
  AND NOT permissions ? 'production-execution:read-all';
