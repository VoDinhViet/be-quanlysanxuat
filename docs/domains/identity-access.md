# Identity & Access

## Purpose

Trả lời hai câu hỏi tách biệt: "ai đang gọi API này" (xác thực) và "họ được phép làm gì" (phân
quyền). Đồng thời giữ hồ sơ nhân sự (phòng ban, chức vụ) — dữ liệu tổ chức, không phải dữ liệu
đăng nhập.

## Core concepts

**Credential ≠ User** — nguồn nhầm lẫn lớn nhất trong repo.
- `users` = con người trong tổ chức — mã nhân viên, họ tên, phòng ban, chức vụ, ...
- `credentials` = tài khoản đăng nhập — `username`/`email`/`password` và **`roleId`**. Phân quyền
  neo ở đây, không ở `users`.

Nối qua `credentials.userId` (NOT NULL, unique) — mọi credential phải gắn đúng một user thật. Chiều
ngược lại tuỳ chọn: một user chưa có credential vẫn hợp lệ (không gán role/đăng nhập được).

**Permission là hằng số trong code, không phải dữ liệu.** `PERMISSION_CODES`
(`src/constants/permission.constant.ts`) là danh sách đóng `resource:action`, không có bảng
`permissions`. Role chỉ tham chiếu mã đó qua cột `jsonb` — thêm năng lực mới luôn cần deploy.

**`system:manage` là quyền tuyệt đối** — đi tắt qua mọi kiểm tra, ở cả guard lẫn service (cố ý
nhân đôi để Super Admin không bị chính logic nghiệp vụ chặn).

## Entities

| Entity | Vai trò | Ghi chú quan hệ |
| --- | --- | --- |
| `users` | Hồ sơ nhân sự | `departmentId`/`positionId` NOT NULL restrict; mọi FK "ai đã thao tác" toàn hệ thống trỏ vào đây |
| `credentials` | Tài khoản đăng nhập | `roleId`→`roles`; `userId`→`users` NOT NULL unique |
| `roles` | Nhóm quyền — full CRUD | `permissions` mảng `jsonb` chứa mã `PERMISSION_CODES`; `isSystem` bảo vệ khỏi sửa/xoá |
| `departments` / `positions` | Cơ cấu tổ chức | Một chức vụ thuộc đúng một phòng ban |

## Lifecycle

`users.status`: `WORKING (mặc định) → RESIGNED`. Cổng chặn login/refresh có 2 lớp độc lập: (1) user
`RESIGNED` (`E018`), (2) `credentials.credentialEnabled = false` (cùng `E018`, kiểm riêng, không
suy từ `users.status`). Không có `INACTIVE` trên `users`.

**Thu hồi quyền là lười** — `status = RESIGNED` không giết token đang sống, chỉ chặn ở lần
login/refresh kế tiếp.

Login phát cặp access+refresh token (2 secret khác nhau), phiên lưu Redis theo `sessionId`. Refresh
xoay `hash`, giữ nguyên `sessionId`. Logout đưa `sessionId` vào blocklist trong TTL access token.

`roles` full CRUD (`GET`/`POST`/`PATCH`/`DELETE`, `roles:read/create/update/delete`). `isSystem`
(ADMIN) từ chối `PATCH`/`DELETE` (`E030`); xoá role còn credential trỏ tới bị chặn (`E029`); cấp
`system:manage` cho role đi qua chống-leo-thang `E034`.

## Business rules

- Không leo thang đặc quyền: gán role có `system:manage` đòi người gán cũng có `system:manage`
  (`E034`).
- Gán role là quyền riêng — chỉ ai có `roles:update` (hoặc `system:manage`) mới ghi được role lên
  credential, kể cả gọi qua `POST`/`PATCH /users`.
- Role chỉ gán được cho user đã có credential (`E032`) — chỉ đúng cho `PATCH /users/:userId/role`;
  `PATCH /users/:userId` (gửi `credential.roleId`) tự tạo credential nếu chưa có.
- Chức vụ phải thuộc đúng phòng ban của user (`E064`, service-check) — khi update kiểm theo cặp
  hiệu lực (giá trị mới nếu gửi, không thì giá trị hiện có).
- Route không khai `@Permissions` chỉ cần đăng nhập hợp lệ; khai nhiều mã thì cần đủ tất cả (AND).
- `roles.isProtected`/`credentials.isProtected` là 2 cờ tách biệt, không suy ra nhau — ẩn khỏi
  `GET /roles`/`GET /users` tương ứng, không chặn thao tác trực tiếp qua id.

## Invariants

- `credentials.userId` NOT NULL + unique — DB enforce thật.
- `payload.sub` JWT luôn là `credentials.id`; `payload.userId` (field riêng) luôn là `users.id`.
- Mã permission ngoài `PERMISSION_CODES` không thể bị yêu cầu (`@Permissions` type theo hằng số đó).
- `system:manage` bao hàm mọi quyền, mọi tầng.
- `POST`/`PATCH /roles` chặn mã lạ (`E031`, `validatePermissionCodes`) — không phải invariant DB
  (`roles.permissions` là `jsonb`, sửa thẳng DB né được); `RolesService.onModuleInit` chỉ cảnh báo,
  không tự sửa.

## Cross-domain dependencies

- **Mọi domain**: `createdBy`/`approvedBy`/`startedBy`/... trỏ `users.id`; `PermissionsGuard` gác
  mọi route không `@Public()` dựa trên `credentials.roleId`.
- **Master data**: `departments`/`positions` phục vụ hồ sơ nhân sự — `docs/domains/partners.md`.

## Common mistakes

1. Nhầm `payload.sub` (credential id) với `payload.userId` (user id) — dùng nhầm field lặng lẽ
   404 hoặc ghi sai FK.
2. Thêm permission mới mà chỉ sửa một chỗ — cần đủ ba: `PERMISSION_CODES`, `@Permissions()` trên
   route, cấp cho role trong `credentials.seed.ts`. Seed thoát sớm nếu role đã tồn tại, môi trường
   cũ phải `UPDATE` tay.
3. Tưởng quyền còn cache — đã bỏ hẳn, giờ là query join thẳng `credentials → roles`, luôn tươi.
4. Tưởng `GET /users` cần quyền đọc — nó gác bằng `users:update`, không có `users:read`/`:delete`.
5. Tưởng dữ liệu cơ cấu tổ chức được bảo vệ — `GET /departments`/`GET /positions` public hoàn toàn.
6. Tưởng `users` có cột `email` riêng — không, luôn qua `credentials.email` (field lồng
   `credential.email` trên request).
7. Tưởng `PATCH /users/:userId` luôn đụng credential — `credential` là object lồng optional, không
   gửi thì không đụng `credentials` chút nào (không `E032`).
8. Tưởng `GET /users/me` trả `permissions` — đã bỏ, đọc riêng qua `GET /users/me/permissions`.

## Related docs

- `docs/domains/orders.md` — nơi dùng `assignedUserId`.
