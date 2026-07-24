# Tính năng: Roles (Vai trò & phân quyền)

## Mục đích

Quản lý vai trò — mỗi vai trò là một bó mã quyền có tên. Đây là nửa "chạy lúc runtime" của RBAC: danh sách *quyền nào tồn tại* được cố định trong code (`PERMISSION_CODES`), còn *vai trò nào có quyền nào* thì admin sửa được qua API mà không cần deploy.

## Quy tắc nghiệp vụ

- **Quyền không tạo được lúc runtime.** `PERMISSION_CODES` (`src/constants/permission.constant.ts`) là nguồn sự thật duy nhất; một vai trò chỉ *tham chiếu* tới các mã đó qua mảng `permissions` (cột `jsonb`). Thêm một năng lực mới nghĩa là thêm mã vào file đó rồi deploy — không có route nào tạo quyền mới.
- **Mã quyền gửi lên được kiểm từng cái.** Bất kỳ phần tử nào không nằm trong catalogue → `E031` (400), và cả request bị từ chối chứ không âm thầm bỏ qua phần tử sai. Ràng buộc `enum` trên DTO chỉ để đổ dropdown cho Swagger; nơi thực sự chặn là `RolesService.validatePermissions`.
- **Chống leo thang đặc quyền.** `system:manage` là quyền "god-mode" — role nào giữ nó thì qua mọi phép kiểm. Chỉ caller *đã* có `system:manage` mới gán được nó cho một vai trò → nếu không, `E034` (403). Không có luật này thì một người chỉ có `roles:create` có thể tự đúc ra vai trò toàn quyền rồi gán cho chính mình. Phép kiểm chỉ chạy **khi `system:manage` thực sự nằm trong payload**, nên các thao tác vai trò thông thường không tốn thêm lượt đọc quyền.
- **Vai trò hệ thống là chỉ-đọc.** `isSystem = true` (ví dụ Super Admin, do seed tạo) → mọi `PATCH`/`DELETE` bị chặn bằng `E030` (403), kể cả khi caller có `system:manage`.
- **`code` bất biến sau khi tạo.** `UpdateRoleReqDto` cố ý không có trường `code` — nó là định danh ổn định. Đổi mã nghĩa là tạo vai trò mới.
- **Xoá là xoá mềm** (`deletedAt`), và **bị chặn khi vai trò còn được dùng**: nếu còn bất kỳ dòng `credentials` nào trỏ tới nó → `E029` (409). Phải gỡ vai trò khỏi mọi tài khoản trước. Lưu ý: bảng `roles` **có** cột `deletedAt` — khác `users` (xem `.claude/rules/database.md`), đừng suy diễn từ bảng này sang bảng khác. Mọi truy vấn ở đây đều lọc `isNull(roles.deletedAt)`, kể cả phép kiểm trùng `code`, nên mã của một vai trò đã xoá mềm **dùng lại được**.
- **Cache quyền bị vô hiệu hoá sau mỗi lần sửa/xoá.** `PermissionsService.invalidateRole(roleId)` được gọi ngay sau `PATCH` và `DELETE`, để request kế tiếp của mọi user đang giữ vai trò đó nạp lại tập quyền mới từ DB thay vì dùng bản Redis cũ. Bỏ bước này thì quyền vừa thu hồi vẫn còn hiệu lực tới khi cache hết hạn.
- **`PATCH` rỗng vẫn an toàn.** Payload luôn được spread kèm `updatedAt: new Date()`, nên `.set()` không bao giờ rỗng — nếu rỗng, drizzle ném `Error: No values to set` và client nhận **500**. Đổi lại, một `PATCH` không thay đổi gì vẫn làm `updated_at` nhích lên; điều này được chấp nhận.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/roles` | `roles:read` | `GetRolesReqDto` — `limit`, `page`, `q`, `order` | `200` + `RoleResDto` phân trang |
| GET | `/roles/permissions` | `roles:read` | — | `200` + `PermissionGroupResDto[]` |
| GET | `/roles/:id` | `roles:read` | — | `200` + `RoleResDto` |
| POST | `/roles` | `roles:create` | `CreateRoleReqDto` — `code`*, `name`*, `permissions`*, `description` | `201` + `RoleResDto` |
| PATCH | `/roles/:id` | `roles:update` | `UpdateRoleReqDto` — `name`, `description`, `permissions` (tất cả tuỳ chọn) | `200` + `RoleResDto` |
| DELETE | `/roles/:id` | `roles:delete` | — | `204`, không có body |

(`*` = bắt buộc)

- **`GET /roles/permissions` được khai báo TRƯỚC `GET /:id`** trong controller — nếu đảo thứ tự, `permissions` sẽ bị nuốt vào route param `:id` và fail ở tầng validate UUID. Đừng sắp xếp lại các handler.
- **`GET /roles/permissions` không phân trang** — trả mảng trần `PermissionGroupResDto[]`, mỗi phần tử là `{ resource, permissions: [{ code, action }] }`, gom theo phần trước dấu `:` của mã quyền. Nó là catalogue tĩnh dựng từ hằng số trong code, dùng để render màn hình sửa vai trò. Cùng hình dạng và cùng lý do với `GET /units` — đừng "chuẩn hoá" cho giống các endpoint danh sách khác.
- `q` khớp mờ (`unaccent` ILIKE) `code` **và** `name`. `GetRolesReqDto` chưa có filter riêng nào.
- Danh sách sắp xếp **mới nhất trước** (`created_at DESC`).
- `code` được **tự động viết hoa** (`toUpperCase` trên DTO), tối đa 50 ký tự. `name` tối đa 100, `description` tối đa 500 và nullable.
- `RoleResDto` là `{ id, code, name, description, permissions, isSystem, createdAt, updatedAt }`. `permissions` là mảng mã quyền dạng chuỗi phẳng, không phải object.
- Sau `POST`/`PATCH`, service đọc lại dòng vừa ghi bằng `getRoleDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Không tìm thấy vai trò (hoặc đã xoá mềm) | `ErrorCode.E027` | 404 |
| `code` đã tồn tại ở vai trò khác chưa xoá | `ErrorCode.E028` | 409 |
| Xoá vai trò đang được ít nhất một `credentials` sử dụng | `ErrorCode.E029` | 409 |
| Sửa/xoá vai trò hệ thống (`isSystem = true`) | `ErrorCode.E030` | 403 |
| `permissions` chứa mã không có trong `PERMISSION_CODES` | `ErrorCode.E031` | 400 |
| Gán `system:manage` trong khi caller không có quyền đó | `ErrorCode.E034` | 403 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

Thứ tự kiểm khi `POST`: trùng `code` (`E028`) → mã quyền hợp lệ (`E031`) → chống leo thang (`E034`). Khi `PATCH`: tồn tại (`E027`) → vai trò hệ thống (`E030`) → mã quyền (`E031`) → chống leo thang (`E034`). Client hiển thị lỗi nên bám theo thứ tự này vì chỉ lỗi đầu tiên được trả về.

## Ngoài phạm vi

- Gán vai trò cho tài khoản — việc đó thuộc `users`/`credentials`, không có route nào ở đây làm.
- Nhiều vai trò trên một tài khoản: `credentials.roleId` là một-một.
- Quyền theo phạm vi dữ liệu (chỉ thấy dữ liệu phòng ban mình) — mô hình hiện tại chỉ có quyền theo hành động.
- Tạo quyền mới lúc runtime — theo thiết kế, phải sửa code và deploy.

## Xem thêm

- Cơ chế guard toàn cục (`@Public()`, `@Permissions()`): chưa có doc; xem `src/api/auth/guards/` và mục "Global secure-by-default guards" trong `CLAUDE.md`.
- `auth` — đăng nhập, token, và `credentials`. Chưa có doc; xem `src/api/auth/`.
