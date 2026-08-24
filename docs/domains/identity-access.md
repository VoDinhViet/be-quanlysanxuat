# Identity & Access

## Purpose

Trả lời hai câu hỏi tách biệt: **"ai đang gọi API này"** (xác thực) và **"họ được phép làm gì"** (phân quyền). Đồng thời giữ hồ sơ nhân sự (phòng ban, chức vụ) — nhưng đó là dữ liệu tổ chức, không phải dữ liệu đăng nhập.

## Core concepts

**Credential ≠ User.** Đây là khái niệm quan trọng nhất của domain này, và là nguồn nhầm lẫn lớn nhất trong repo.

- **`users`** = _con người trong tổ chức_ — bảng định danh chính. Giữ mã nhân viên, họ tên, giới tính, ngày sinh, phòng ban, chức vụ, ngày vào làm, ảnh đại diện.
- **`credentials`** = _tài khoản đăng nhập_. Giữ `username`/`email`/`password` và — quan trọng — `roleId`. **Phân quyền neo ở đây**, không ở `users`.

Hai bên nối nhau qua `credentials.userId` (NOT NULL, unique). Chiều bắt buộc chỉ một hướng: **mọi
credential phải gắn đúng một user thật** (đảo lại 2026-08-01 — trước đó là `users.credentialId`
nullable, cho phép "admin-only login"; giờ khái niệm đó không còn tồn tại). Chiều ngược lại vẫn tuỳ
chọn: một user chưa có credential vẫn hợp lệ (nhưng không gán role được, không đăng nhập được).

**Permission là hằng số trong code, không phải dữ liệu.** `PERMISSION_CODES` (`src/constants/permission.constant.ts`) là danh sách đóng dạng `resource:action`. Không có bảng `permissions`. Một role chỉ **tham chiếu** các mã đó qua cột `jsonb`. Hệ quả: thêm một năng lực mới luôn cần deploy, không chỉ sửa dữ liệu.

**`system:manage` là quyền tuyệt đối** — đi tắt qua mọi kiểm tra, ở cả tầng guard lẫn tầng service (cố ý nhân đôi để Super Admin không bị chính logic nghiệp vụ chặn).

## Entities

| Entity                      | Vai trò                              | Ghi chú quan hệ                                                                                                                                                                                       |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | Hồ sơ nhân sự — bảng định danh chính | `departmentId`/`positionId` NOT NULL, `restrict`; **mọi FK "ai đã thao tác"** (`createdBy`, `approvedBy`, `startedBy`, ...) trong toàn hệ thống trỏ vào đây, kể cả `users.createdBy` (self-reference) |
| `credentials`               | Tài khoản đăng nhập                  | `roleId` → `roles`; `userId` → `users` (NOT NULL, unique — mỗi credential đúng một chủ)                                                                                                               |
| `roles`                     | Nhóm quyền                           | `permissions` là mảng `jsonb` chứa mã từ `PERMISSION_CODES`; `isSystem` đánh dấu role được seed                                                                                                       |
| `departments` / `positions` | Cơ cấu tổ chức                       | Một chức vụ thuộc đúng một phòng ban                                                                                                                                                                  |

## Lifecycle

Trạng thái nhân sự chính của domain là `users.status`:

```
WORKING (mặc định) ──> RESIGNED
```

Cổng chặn login/refresh có **hai lớp độc lập, không liên thông nhau**: (1) user liên kết ở
`RESIGNED` (`E018`), và (2) `credentials.credentialEnabled = false` (`auth.service.ts` — cùng
`E018`, kiểm tra riêng, không suy ra từ `users.status`). Không có trạng thái `INACTIVE` trên
`users`.

**Thu hồi quyền là lười, không tức thời.** Đặt `status = RESIGNED` **không** giết token đang sống — access token vẫn dùng được tới khi hết hạn (mặc định 7 ngày). Chặn chỉ xảy ra ở lần login/refresh kế tiếp.

Phiên đăng nhập: login phát một cặp access + refresh token (hai secret khác nhau), trạng thái phiên lưu ở Redis theo `sessionId`. Refresh xoay `hash` nhưng **giữ nguyên `sessionId`**. Logout đưa `sessionId` vào blocklist trong đúng TTL của access token.

## Business rules

- **Không leo thang đặc quyền**: muốn gán một role có `system:manage` thì bản thân người gán phải đang có `system:manage` (`E034`).
- **Gán role là quyền riêng**: chỉ ai có `roles:update` (hoặc `system:manage`) mới ghi được role lên một credential — kể cả khi đang gọi `POST /users`/`PATCH /users/:id` (vốn chỉ cần `users:create`/`users:update`).
- **Role chỉ gán được cho user đã có credential** (`E032`) — vì role sống trên credential. Chỉ
  đúng cho `PATCH /users/:userId/role`: `PATCH /users/:userId` (gửi `credential.roleId`) tự tạo
  credential nếu chưa có, nên không đụng `E032` (xem Common mistakes #9).
- **Chức vụ phải thuộc đúng phòng ban của user** (`E064`). Kiểm ở tầng service, không phải DB. Khi update, kiểm lại theo _cặp hiệu lực_ (giá trị mới nếu được gửi, nếu không thì giá trị hiện có) — nên đổi mỗi phòng ban mà không đổi chức vụ luôn báo lỗi, đúng thiết kế.
- **Route không khai `@Permissions` chỉ cần đăng nhập hợp lệ**; khai nhiều mã thì phải có **đủ tất cả** (AND, không phải OR).
- **Hai cờ `isProtected` tách biệt, không cái nào suy ra cái kia**: `roles.isProtected = true` ẩn
  role đó khỏi `GET /roles` (độc lập với `isSystem`, vốn chỉ bảo vệ khỏi sửa/xoá); `credentials.isProtected = true` ẩn đúng tài khoản đó khỏi `GET /users`. Hiện chỉ role ADMIN và tài khoản
  `admin` có cờ này — nhưng cố ý không liên kết hai cờ, vì đổi role của một tài khoản không nên tự
  động đổi việc nó ẩn/hiện trong `GET /users`. Cả hai chỉ ẩn khỏi danh sách: role vẫn gán được thẳng
  qua `roleId`, user vẫn xem/sửa được thẳng qua `GET /users/:userId`/`PATCH /users/:userId`.

## Invariants

- `credentials.userId` **NOT NULL + unique** — mỗi credential đúng một chủ, DB enforce thật (khác
  hẳn liên kết cũ, chỉ là quy ước ở tầng code).
- `payload.sub` trong JWT **luôn** là `credentials.id` — không đổi. `payload.userId` là field
  **mới**, tách biệt, luôn là `users.id`; xem Common mistakes #1 để tránh nhầm hai field này.
- Một mã permission không nằm trong `PERMISSION_CODES` **không bao giờ có thể bị _yêu cầu_** — decorator `@Permissions` được type theo hằng số đó.
- `system:manage` bao hàm mọi quyền khác, ở mọi tầng kiểm tra.
- **Không thể cấp mã permission rác qua API.** `POST`/`PATCH /roles` chạy `RolesService.validatePermissionCodes` (dùng `isPermissionCode`/`PERMISSION_CODE_SET`), ném `E031` nếu bất kỳ mã nào không nằm trong `PERMISSION_CODES`. Vẫn không phải invariant ở tầng DB: `roles.permissions` là `jsonb`, sửa thẳng DB thì né được kiểm tra này — `RolesService.onModuleInit` quét và `logger.warn` mọi role còn mã lạ lúc khởi động, để bắt được trường hợp đó (không tự sửa, chỉ cảnh báo).

`roles` giờ có đủ CRUD (`GET`/`POST`/`PATCH`/`DELETE /roles`, quyền tương ứng `roles:read/create/update/delete`) — không còn chỉ `GET /roles` như trước 2026-08-24. Role `isSystem` (ADMIN) từ chối `PATCH`/`DELETE` (`E030`); xoá một role còn credential trỏ tới bị chặn (`E029 role.error.in_use`); cấp `system:manage` cho một role (tạo mới hoặc sửa) đi qua đúng chống-leo-thang `E034` như gán role cho user (`RolesService.ensureActorMayGrantPermissions`, mirror `UsersService.ensureActorMayAssign`).

## Cross-domain dependencies

- **Mọi domain** đều phụ thuộc vào domain này: cột `createdBy`/`approvedBy`/`startedBy`/... khắp hệ
  thống trỏ `users.id` (đảo lại 2026-08-01 — trước đó trỏ `credentials.id`, `orders.assignedUserId`
  (trước đó `staffId`) từng là ngoại lệ duy nhất; giờ không còn ngoại lệ nào, mọi cột audit cùng một
  quy ước), và `PermissionsGuard`
  gác mọi route không `@Public()` (dựa trên `credentials.roleId`, không đổi).
- **Master data** `departments`/`positions` phục vụ hồ sơ nhân sự — xem `docs/domains/partners.md`.

## Common mistakes

1. **Nhầm `payload.sub` với `payload.userId`.** Cả hai cùng có trong JWT nhưng khác bảng: `sub` là
   credential id (`GET /users/me` nhận giá trị này), `userId` là user id (mọi write-site "ai đã thao
   tác" dùng giá trị này). Dùng nhầm field thì lặng lẽ 404 hoặc ghi sai FK, không phải lỗi rõ ràng.
   `LoginResDto.userId` nay trả đúng `users.id` (đã sửa 2026-08-01 — trước đó trả nhầm credential id
   dù tên field nói khác).
2. **Tưởng `@Permissions` trên route `@ApiPublic` có tác dụng.** Không — cả hai guard `return true` trước khi đọc metadata quyền. Khoảng 8 route (`clients`, `suppliers`, `operations`) đang xếp chồng như vậy và **hoàn toàn không xác thực**. Muốn siết thì phải bỏ `@ApiPublic()`, và đó là breaking change với client đang gọi. (`items`/`boms` từng nằm trong nhóm này — đã chuyển hết sang `@ApiAuth()` khi `products`/`materials` gộp thành `items`, vì gộp bảng kéo theo field vật tư như `supplierId`/`minStock` vốn trước đó phải đăng nhập mới xem được, xem `docs/decisions/items-merge.md`.)
3. **Thêm permission mới mà chỉ sửa một chỗ.** Cần đủ ba: thêm vào `PERMISSION_CODES`, gắn `@Permissions()` lên route, và cấp cho role trong `credentials.seed.ts`. Tệ hơn: **chạy lại seed không cập nhật role đã tồn tại** — hàm seed thoát sớm nếu thấy mã role đã có, nên môi trường cũ phải `UPDATE` tay.
4. **Tưởng quyền vẫn còn cache.** `PermissionsService.getPermissionCodes` từng cache 2 tầng qua
   Redis (TTL 5 phút — nguồn gốc một lớp bug lịch sử: sau khi vá role, quyền cũ còn hiệu lực tới 5
   phút vì `invalidateRole()` không được gọi ở đâu). Đã bỏ hẳn (2026-08-24) — giờ là một query join
   thẳng `credentials` → `roles`, luôn tươi, không còn `invalidateRole`/`invalidateCredential`.
5. **`users.deletedAt` từng lọc không nhất quán, đã sửa.** `GET /users` (danh sách) thiếu
   `isNull(users.deletedAt)` trong `baseFilter` — chỉ `UsersService.getUserDepartmentId`/
   `InventoryIssuesService` lọc đúng, danh sách thì không, vi phạm `.claude/rules/database.md`
   (MUST filter mọi read). Đã thêm vào `baseFilter` — nay lọc đủ và nhất quán ở mọi read-site, cùng
   khuôn `roles.deletedAt`.
6. **Tưởng `GET /users` cần quyền đọc.** Nó gác bằng `users:update` — không hề có mã `users:read` hay `users:delete`.
7. **Tưởng dữ liệu cơ cấu tổ chức được bảo vệ.** `GET /departments` và `GET /positions` là public hoàn toàn.
8. **Tưởng `users` có cột `email` riêng.** Không còn — `users` từng có `email` (hồ sơ nhân sự) song
   song `credentials.email` (đăng nhập), gộp lại 2026-08-19 vì hai nguồn không nghĩa gì khác nhau
   trong thực tế. Email luôn đọc/ghi qua `credentials.email`; `POST /users`/`PATCH /users/:userId`
   sửa email qua field lồng `credential.email`, không phải field phẳng.
9. **Tưởng `PATCH /users/:userId` luôn đụng credential.** Đảo chiều 2026-08-19 — trước đó
   `credentialEnabled` là field bắt buộc trên `UpdateUserReqDto` nên mọi lần gọi đều ghi xuống
   `credentials` và đòi user đã có credential liên kết (`E032`), kể cả khi chỉ sửa field hồ sơ
   thuần (`note`, `address`, ...). Giờ `UpdateUserReqDto.credential` là một object lồng optional,
   đối xứng với `CreateUserReqDto.credential`: không gửi thì không đụng `credentials` chút nào
   (không còn `E032` cho trường hợp này); gửi mà user **chưa** có credential thì tạo mới — bắt
   buộc kèm `password` (thiếu → `E207`), khác nhánh sửa credential sẵn có (bỏ trống `password` =
   giữ mật khẩu cũ). `username`/`email` luôn được kiểm trùng lặp lại (loại trừ chính credential
   đang sửa), `roleId` vẫn đi qua đúng guard `roles:update`/chống leo thang (`E033`/`E034`) như
   `POST /users`.
10. **Tưởng `GET /users/me` trả `permissions`.** Field đó đã bỏ (2026-08-24) — `CurrentUserResDto`
    giờ chỉ có hồ sơ (tên, avatar, role). Quyền hiệu lực đọc riêng qua `GET /users/me/permissions`
    (`CurrentPermissionsResDto`), route tách ra để không phải trả cả join
    `credentials`/`users`/`files` chỉ để lấy một mảng string.

## Related docs

- `.claude/skills/new-api-module/SKILL.md` — nơi một permission mới phải được khai báo và cấp.
- `docs/domains/orders.md` — nơi dùng `assignedUserId`.
- `.claude/rules/service.md` — quy tắc khai `@Permissions` khi viết route mới.
