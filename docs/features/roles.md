# Tính năng: Roles (Vai trò & phân quyền)

## Mục đích

Danh mục vai trò dùng cho RBAC — mỗi vai trò là một bó mã quyền có tên. Danh sách *quyền nào tồn tại* được cố định trong code (`PERMISSION_CODES`, `src/constants/permission.constant.ts`); *vai trò nào có quyền nào* lưu trong bảng `roles` (cột `permissions`, kiểu `jsonb`). Module này hiện chỉ expose **đọc** danh mục đó — xem mục "Ngoài phạm vi" bên dưới.

## Quy tắc nghiệp vụ

- **Quyền không tạo được lúc runtime.** `PERMISSION_CODES` là nguồn sự thật duy nhất; thêm một năng lực mới nghĩa là thêm mã vào file đó rồi deploy.
- Danh sách chỉ trả về vai trò **chưa xoá mềm** (`isNull(roles.deletedAt)`). Bảng `roles` **có** cột `deletedAt` — khác `users` (xem `.claude/rules/database.md`), đừng suy diễn từ bảng này sang bảng khác.
- `RoleResDto` là `{ id, code, name, description, permissions, isSystem, createdAt, updatedAt }`. `permissions` là mảng mã quyền dạng chuỗi phẳng, không phải object. `isSystem` đánh dấu vai trò do seed tạo (ví dụ Super Admin) — chỉ mang tính hiển thị ở module này vì không có route ghi để ràng buộc nó.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/roles` | `roles:read` | `GetRolesReqDto` — `q` | `200` + `RoleResDto[]` |

- **Không phân trang** — trả mảng trần `RoleResDto[]`. `roles` là catalogue nhỏ, cùng lý do với `GET /units`.
- `q` khớp mờ (`unaccent` ILIKE) `code` **và** `name`. `GetRolesReqDto` chưa có filter riêng nào khác.
- Danh sách sắp xếp **mới nhất trước** (`created_at DESC`).

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Role của caller thiếu quyền `roles:read` | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

## Ngoài phạm vi

- **Tạo/sửa/xoá vai trò và xem catalogue quyền theo nhóm** — `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`, `GET /roles/:id`, `GET /roles/permissions` đã bị **gỡ ngày 2026-07-25** vì chưa cần dùng. Code cũ (kèm các quy tắc nghiệp vụ: chống leo thang đặc quyền `system:manage`/E034, vai trò hệ thống chỉ-đọc/E030, `code` bất biến, xoá mềm bị chặn khi còn `credentials` dùng/E029, trùng `code`/E028, mã quyền ngoài catalogue/E031, invalidate cache sau sửa/xoá) vẫn còn trong git history để khôi phục khi cần. `roles:create`/`roles:delete` trong `PERMISSION_CODES` và `ErrorCode.E027`–`E031` được giữ nguyên (không xoá) cho việc bật lại sau; `E027`/`E034`/`roles:update` vẫn đang được dùng bởi luồng gán vai trò ở module `users` (`UsersService.resolveRoleForAssignment`).
- Gán vai trò cho tài khoản — việc đó thuộc `users`/`credentials`, không có route nào ở đây làm.
- Nhiều vai trò trên một tài khoản: `credentials.roleId` là một-một.
- Quyền theo phạm vi dữ liệu (chỉ thấy dữ liệu phòng ban mình) — mô hình hiện tại chỉ có quyền theo hành động.
- Tạo quyền mới lúc runtime — theo thiết kế, phải sửa code và deploy.

## Xem thêm

- Cơ chế guard toàn cục (`@Public()`, `@Permissions()`): chưa có doc; xem `src/api/auth/guards/` và mục "Global secure-by-default guards" trong `CLAUDE.md`.
- `auth` — đăng nhập, token, và `credentials`. Chưa có doc; xem `src/api/auth/`.
- `users` — gán vai trò cho tài khoản (`PATCH /users/:userId/role`), nơi vẫn dùng `roles:update`/`E027`/`E034` dù CRUD của module này đã gỡ.

## Frontend integration notes

**2026-07-25 — `GET /roles` bỏ phân trang, và các endpoint CRUD/permissions catalog bị gỡ.**

- Response của `GET /roles` đổi từ `{ data, pagination }` sang **mảng trần** `RoleResDto[]`. Bỏ đọc `.data`/`.pagination`, dùng thẳng mảng trả về.
- Không gửi `limit`/`page`/`order` nữa — `GetRolesReqDto` chỉ còn `q`; server không đọc các field đó dù có gửi lên.
- **Đã gỡ**: `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`, `GET /roles/:id`, `GET /roles/permissions`. FE bỏ mọi màn hình/lời gọi tạo-sửa-xoá vai trò hoặc hiển thị catalogue quyền theo nhóm cho tới khi các endpoint này được thêm lại.
