# Identity & Access

## Purpose

Trả lời hai câu hỏi tách biệt: **"ai đang gọi API này"** (xác thực) và **"họ được phép làm gì"** (phân quyền). Đồng thời giữ hồ sơ nhân sự (phòng ban, chức vụ) — nhưng đó là dữ liệu tổ chức, không phải dữ liệu đăng nhập.

## Core concepts

**Credential ≠ User.** Đây là khái niệm quan trọng nhất của domain này, và là nguồn nhầm lẫn lớn nhất trong repo.

- **`credentials`** = *tài khoản đăng nhập*. Giữ `username`/`email`/`password` và — quan trọng — `roleId`. **Phân quyền neo ở đây**, không ở `users`.
- **`users`** = *con người trong tổ chức*. Giữ mã nhân viên, họ tên, giới tính, ngày sinh, phòng ban, chức vụ, ngày vào làm, ảnh đại diện.

Hai bên nối nhau qua `users.credentialId` (nullable). Cả hai chiều đều **tuỳ chọn**: một credential không gắn user nào là hợp lệ (và luôn được coi là đang hoạt động), một user chưa có credential cũng hợp lệ (nhưng không gán role được).

**Permission là hằng số trong code, không phải dữ liệu.** `PERMISSION_CODES` (`src/constants/permission.constant.ts`) là danh sách đóng dạng `resource:action`. Không có bảng `permissions`. Một role chỉ **tham chiếu** các mã đó qua cột `jsonb`. Hệ quả: thêm một năng lực mới luôn cần deploy, không chỉ sửa dữ liệu.

**`system:manage` là quyền tuyệt đối** — đi tắt qua mọi kiểm tra, ở cả tầng guard lẫn tầng service (cố ý nhân đôi để Super Admin không bị chính logic nghiệp vụ chặn).

## Entities

| Entity | Vai trò | Ghi chú quan hệ |
| --- | --- | --- |
| `credentials` | Tài khoản đăng nhập | `roleId` → `roles`; **mọi FK "ai đã thao tác"** (`createdBy`, `approvedBy`, `startedBy`, ...) trong toàn hệ thống trỏ vào đây |
| `users` | Hồ sơ nhân sự | `credentialId` → `credentials` (nullable); `departmentId`/`positionId` NOT NULL, `restrict` |
| `roles` | Nhóm quyền | `permissions` là mảng `jsonb` chứa mã từ `PERMISSION_CODES`; `isSystem` đánh dấu role được seed |
| `departments` / `positions` | Cơ cấu tổ chức | Một chức vụ thuộc đúng một phòng ban |

**`orders.staffId` là ngoại lệ duy nhất** trỏ `users.id` thay vì `credentials.id` — vì "nhân viên kinh doanh phụ trách đơn" là một vai trò trong tổ chức, không phải "người vừa bấm nút".

## Lifecycle

`credentials` **không có** cột trạng thái — cố ý. Trạng thái duy nhất của domain là `users.status`:

```
WORKING (mặc định) ──> RESIGNED
```

Cổng chặn: chỉ khi user liên kết ở `RESIGNED` thì login/refresh mới bị từ chối (`E018`). Không có trạng thái `INACTIVE`.

**Thu hồi quyền là lười, không tức thời.** Đặt `status = RESIGNED` **không** giết token đang sống — access token vẫn dùng được tới khi hết hạn (mặc định 7 ngày). Chặn chỉ xảy ra ở lần login/refresh kế tiếp.

Phiên đăng nhập: login phát một cặp access + refresh token (hai secret khác nhau), trạng thái phiên lưu ở Redis theo `sessionId`. Refresh xoay `hash` nhưng **giữ nguyên `sessionId`**. Logout đưa `sessionId` vào blocklist trong đúng TTL của access token.

## Business rules

- **Không leo thang đặc quyền**: muốn gán một role có `system:manage` thì bản thân người gán phải đang có `system:manage` (`E034`).
- **Gán role là quyền riêng**: chỉ ai có `roles:update` (hoặc `system:manage`) mới ghi được role lên một credential — kể cả khi đang gọi `POST /users`/`PATCH /users/:id` (vốn chỉ cần `users:create`/`users:update`).
- **Role chỉ gán được cho user đã có credential** (`E032`) — vì role sống trên credential.
- **Chức vụ phải thuộc đúng phòng ban của user** (`E064`). Kiểm ở tầng service, không phải DB. Khi update, kiểm lại theo *cặp hiệu lực* (giá trị mới nếu được gửi, nếu không thì giá trị hiện có) — nên đổi mỗi phòng ban mà không đổi chức vụ luôn báo lỗi, đúng thiết kế.
- **Route không khai `@Permissions` chỉ cần đăng nhập hợp lệ**; khai nhiều mã thì phải có **đủ tất cả** (AND, không phải OR).

## Invariants

- `payload.sub` trong JWT **luôn** là `credentials.id`.
- Một mã permission không nằm trong `PERMISSION_CODES` **không bao giờ có thể bị *yêu cầu*** — decorator `@Permissions` được type theo hằng số đó.
- `system:manage` bao hàm mọi quyền khác, ở mọi tầng kiểm tra.

Ba điều **không** phải invariant dù trông có vẻ:

- **Mã permission rác vẫn có thể được *cấp*.** `roles.permissions` là `jsonb`, và không có đường ghi role nào ở runtime để validate. `isPermissionCode`/`PERMISSION_CODE_SET` tồn tại nhưng **không được gọi ở đâu cả**.
- **`users.credentialId` không unique** — chỉ có index thường. DB cho phép nhiều user trỏ chung một credential; code thì giả định 1-1.
- **Role hiện không sửa được qua API.** `roles` chỉ có `GET /roles`; `roles:create`/`roles:delete` không gắn với route nào. Role sinh ra từ seed. Doc comment trong schema nói admin tự tạo role được ở runtime — đó là **dự định, chưa phải sự thật**.

## Cross-domain dependencies

- **Mọi domain** đều phụ thuộc vào domain này: cột `createdBy`/`approvedBy`/... khắp hệ thống trỏ `credentials.id`, và `PermissionsGuard` gác mọi route không `@Public()`.
- **Orders** là domain duy nhất tham chiếu `users.id` (qua `staffId`).
- **Master data** `departments`/`positions` phục vụ hồ sơ nhân sự — xem `docs/domains/partners.md`.

## Common mistakes

1. **Nhầm `credentialId` với `userId`.** `payload.sub` là credential id; `GET /users/me` nhận credential id; nhưng `PATCH /users/:userId/*` nhận **user** id. Truyền nhầm thì lặng lẽ 404, không phải lỗi rõ ràng. `LoginResDto.userId` **thực chất chứa credential id** dù tên gọi và mô tả nói khác.
2. **Tưởng `@Permissions` trên route `@ApiPublic` có tác dụng.** Không — cả hai guard `return true` trước khi đọc metadata quyền. Khoảng 14 route (`clients`, `products`, `suppliers`, `boms`, `routing`, `operations`) đang xếp chồng như vậy và **hoàn toàn không xác thực**. Muốn siết thì phải bỏ `@ApiPublic()`, và đó là breaking change với client đang gọi.
3. **Thêm permission mới mà chỉ sửa một chỗ.** Cần đủ ba: thêm vào `PERMISSION_CODES`, gắn `@Permissions()` lên route, và cấp cho role trong `credentials.seed.ts`. Tệ hơn: **chạy lại seed không cập nhật role đã tồn tại** — hàm seed thoát sớm nếu thấy mã role đã có, nên môi trường cũ phải `UPDATE` tay.
4. **Quên invalidate cache khi đổi phân quyền.** Quyền được cache Redis hai tầng, TTL 5 phút. `invalidateRole()` hiện **không được gọi ở đâu** (an toàn vì chưa có đường sửa role) — nếu sau này thêm chức năng sửa role mà quên gọi, quyền cũ còn hiệu lực tới 5 phút.
5. **Tưởng `users` có lọc xoá mềm.** Cột `users.deletedAt` tồn tại nhưng **không nơi nào đọc** — user đã "xoá" vẫn hiện trong `GET /users` và vẫn gán được. (`roles.deletedAt` thì có lọc thật.)
6. **Tưởng `GET /users` cần quyền đọc.** Nó gác bằng `users:update` — không hề có mã `users:read` hay `users:delete`.
7. **Tưởng dữ liệu cơ cấu tổ chức được bảo vệ.** `GET /departments` và `GET /positions` là public hoàn toàn.

## Related docs

- `.claude/skills/new-api-module/SKILL.md` — nơi một permission mới phải được khai báo và cấp.
- `docs/domains/orders.md` — nơi dùng `staffId`.
- `.claude/rules/service.md` — quy tắc khai `@Permissions` khi viết route mới.
