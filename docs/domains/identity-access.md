# Nhận dạng và phân quyền

Phạm vi: `src/api/auth`, `users`, `roles`, `departments`, `positions`. Schema: `src/database/schemas/identity-access/` (`users`, `credentials`, `roles`), `departments.ts`, `positions.ts`.

## Mô hình dữ liệu

```
departments 1──n positions
departments 1──n users  n──1 positions
users 1──1 credentials n──1 roles
users n──1 files (ảnh đại diện)
```

| Bảng | Vai trò | Điểm cần nhớ |
|---|---|---|
| `users` | Hồ sơ nhân sự: mã `NVxxxx`, họ tên, giới tính, ngày sinh, CCCD, SĐT, địa chỉ, phòng ban, chức vụ, ngày vào làm, trạng thái `WORKING`/`RESIGNED` | `idNumber` unique. `createdBy` trỏ `users.id`. Có `deletedAt` nhưng không có route xoá user. |
| `credentials` | Tài khoản đăng nhập: `username`, `email`, `password` (bcrypt), `roleId`, `credentialEnabled`, `isProtected` | Mỗi credential bắt buộc gắn đúng một user (`userId` NOT NULL, unique). Một user có thể chưa có credential. `username` unique không phân biệt hoa thường (`uq_credentials_username_lower`). |
| `roles` | Vai trò = tên + mảng mã quyền (`permissions` jsonb) | `code` unique. `isSystem`: không sửa/xoá được. `isProtected`: bị ẩn khỏi `GET /roles` nhưng vẫn gán được nếu biết `roleId`. Có `deletedAt`. |
| `departments` | Phòng ban: `code` unique, `isActive` | Xoá cứng. |
| `positions` | Chức vụ, thuộc đúng một phòng ban | Xoá cứng. |

`credentials.isProtected` và `roles.isProtected` là hai cờ độc lập: cờ trên credential ẩn tài khoản khỏi `GET /users` (hiện dành cho tài khoản admin), cờ trên role ẩn role khỏi `GET /roles`. Đổi role của một tài khoản không tự đổi việc nó có bị ẩn hay không.

Khoá ngoại `credentials.userId` dùng `onDelete: restrict` làm lưới an toàn: không có route xoá user, nhưng nếu có thì không để user biến mất khi vẫn còn tài khoản trỏ vào. Các cột audit (`createdBy`...) ở các domain khác trỏ `users.id`, không trỏ `credentials.id`.

## Xác thực (`/api/auth`)

| Route | Quyền | Việc làm |
|---|---|---|
| `POST /auth/login` | công khai | Đăng nhập bằng `identifier` (username hoặc email, tự chuyển về chữ thường) và `password`. |
| `POST /auth/refresh` | công khai | Đổi refresh token lấy cặp token mới. |
| `POST /auth/logout` | đã đăng nhập | Đưa session vào blacklist, xoá hash refresh. Trả 204. |

Luồng:

1. Login tìm credential theo `lower(username)` hoặc `email`; sai tài khoản hoặc sai mật khẩu đều trả cùng lỗi `E004` (401), không lộ tài khoản nào tồn tại.
2. Từ chối bằng `E018` (403) nếu `credentialEnabled = false` hoặc `users.status = RESIGNED`. Kiểm tra này chạy lại ở mỗi lần refresh.
3. Mỗi lần đăng nhập tạo một `sessionId` mới. Access token là JWT ký bằng `AUTH_JWT_SECRET`, payload `{ sub: credentialId, userId, username, email, sessionId }`. Refresh token ký bằng `AUTH_REFRESH_SECRET`, payload `{ sessionId, hash }`.
4. Redis lưu `session_hash:<sessionId>` = `{ credentialId, hash }` với TTL bằng hạn refresh token. Refresh chỉ thành công nếu hash trong token khớp hash trong Redis; mỗi lần refresh cấp hash mới nên refresh token cũ hết tác dụng.
5. Logout ghi `session_blacklist:<sessionId>` (TTL bằng hạn access token) và xoá `session_hash`. `JwtAuthGuard` kiểm tra blacklist ở mỗi request nên access token bị thu hồi ngay.

Cấu hình: `AUTH_JWT_SECRET`, `AUTH_REFRESH_SECRET` bắt buộc; `AUTH_JWT_TOKEN_EXPIRES_IN`, `AUTH_REFRESH_TOKEN_EXPIRES_IN` mặc định `7d`.

**Lưu ý:** `sub` của JWT là **credential id**, không phải `users.id`. `userId` nằm riêng trong payload. Code cần user id phải đọc `userId`; `@CurrentUser()` trả về payload này.

## Phân quyền

Mã quyền là chuỗi `resource:action` trong mảng `PERMISSION_CODES` (`src/constants/permission.constant.ts`), nguồn sự thật duy nhất. Quyền không tạo lúc chạy: thêm khả năng mới nghĩa là thêm mã vào mảng rồi deploy. Role chỉ tham chiếu mã.

- `PermissionsGuard` nạp quyền bằng `PermissionsService.getPermissionCodes(credentialId)`: một câu truy vấn join `credentials` với `roles` (bỏ role đã xoá mềm), không cache. User không có role thì không có quyền nào.
- `system:manage` (`SUPER_PERMISSION`) qua mọi kiểm tra.
- Route không khai `@Permissions(...)` chỉ cần đăng nhập. Route khai nhiều mã thì phải có **đủ tất cả**. Thiếu quyền trả `E033` (403).
- Chỉ controller kiểm tra quyền. Nơi nào gọi service từ ngoài controller (job nền, tool AI, module khác) phải tự kiểm tra bằng `PermissionsService`.

### Danh mục mã quyền

Hiển thị theo khối (`block`): Hệ thống, Danh mục, Bán hàng, Kho, Sản xuất, Mua hàng, Chất lượng, Báo cáo. `GET /roles/permissions` trả danh mục nhóm sẵn (nhãn tiếng Việt, mô tả) để dựng ma trận cấu hình role.

| Nhóm | Mã |
|---|---|
| Hệ thống | `system:manage`, `users:create`, `users:update`, `roles:read/create/update/delete`, `departments:read/create/update/delete`, `positions:read/create/update/delete` |
| Danh mục | `clients:*`, `items:read/create/update/delete/copy/bom-manage`, `operations:*`, `suppliers:*` (mỗi nhóm có đủ `read/create/update/delete`) |
| Bán hàng | `orders:read/create/update/approve/delete`, `outbound:read/create/update/approve/delete` |
| Kho | `inventory:read/create/update/delete`, `inventory-requisitions:read/create/update/delete/approve`, `inventory-requisitions:issue` (đã nghỉ hưu) |
| Sản xuất | `production:read/create/update/approve`, `production-execution:read/report/read-all` |
| Mua hàng | `purchase-requests:read/create/update/delete/approve`, `purchasing:read/create/update/delete/approve` |
| Chất lượng | `iqc:*`, `oqc:*`, `outsourcing:*` (mỗi nhóm có đủ `read/create/update/delete`) |
| Báo cáo | `reports:read` |

`inventory-requisitions:issue` thuộc route xuất kho đã bỏ (duyệt phiếu lãnh nay tự sinh phiếu xuất kho). Mã vẫn giữ trong danh mục để các role cũ chứa nó không bị cảnh báo "unknown permission code".

### Kiểm tra mã quyền lệch

Cột `roles.permissions` là jsonb, DB không ràng buộc. `RolesService` kiểm tra mã quyền ở mọi lần ghi qua API (lỗi `E031`). Khi app khởi động, `onModuleInit` quét mọi role và ghi **cảnh báo** tên các mã không còn trong danh mục (trường hợp sửa tay trong DB hoặc đổi tên mã). Migration `0147_repair_role_permissions.sql` là ví dụ sửa dữ liệu cũ.

## Role (`/api/roles`)

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /roles` | `roles:read` | Danh sách, tìm theo mã/tên (không dấu), bỏ role `isProtected`, mới nhất trước. Không phân trang. |
| `GET /roles/permissions` | `roles:read` | Danh mục quyền theo nhóm. |
| `GET /roles/:roleId` | `roles:read` | Chi tiết. |
| `POST /roles` | `roles:create` | Tạo. |
| `PATCH /roles/:roleId` | `roles:update` | Sửa. |
| `DELETE /roles/:roleId` | `roles:delete` | Xoá mềm. |

Quy tắc:
- Mã role phải duy nhất: `E028` (409).
- Role `isSystem` không sửa/xoá: `E030` (403).
- Không xoá role đang gán cho một credential: `E029` (409).
- Mã quyền không có trong danh mục: `E031` (400).
- **Chống leo thang đặc quyền:** gán mã `system:manage` vào role (khi tạo hoặc sửa `permissions`) chỉ được nếu chính người thao tác đang có `system:manage`: `E034` (403). Nếu không, người có `roles:update` có thể tự cấp toàn quyền qua một role do họ sửa.

## Nhân sự (`/api/users`)

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /users/me` | đăng nhập | Hồ sơ của chính mình, lấy theo credential id (id, username, email, họ tên, ảnh, role). `E002` nếu không thấy. |
| `GET /users/me/permissions` | đăng nhập | Chỉ danh sách mã quyền hiệu lực, dùng cho sidebar/route guard phía frontend. |
| `GET /users` | `users:update` | Danh sách phân trang, tìm theo họ tên hoặc mã (`ilike`). Ẩn user có credential `isProtected`. |
| `GET /users/options` | đăng nhập | Danh sách rút gọn để chọn người (select box). |
| `GET /users/export` | `users:update` | Xuất Excel, cùng bộ lọc với danh sách; không được là đường vòng qua cờ ẩn. |
| `GET /users/:userId` | `users:update` | Chi tiết. `E012` nếu không thấy. |
| `POST /users` | `users:create` | Tạo user kèm tài khoản đăng nhập tuỳ chọn. Trả 204. |
| `PATCH /users/:userId` | `users:update` | Sửa hồ sơ và/hoặc tài khoản. |
| `PATCH /users/:userId/role` | `roles:update` | Gán role cho tài khoản của user. |

Điều đáng chú ý: `GET /users` và `GET /users/:userId` đòi `users:update`, không có `users:read`; hiện không có mã `users:read`.

### Tạo user

1. Kiểm tra trước, ngoài transaction: phòng ban tồn tại (`E014`), chức vụ tồn tại và **thuộc đúng phòng ban đó** (`E015`, `E064`), CCCD chưa trùng (`E013`), file ảnh đại diện (gắn qua `FilesService.linkFiles`), role được phép gán, username (`E001`) rồi email (`E003`). Username kiểm trước email, tuần tự, để thứ tự báo lỗi xác định.
2. Trong một transaction: cấp mã `NV` + số 4 chữ số từ `DocumentType.USER`, ghi `users` (`status` mặc định `WORKING`, `createdBy` = người tạo), rồi ghi `credentials` nếu có gửi `credential`. Mật khẩu băm bcrypt, 10 vòng.

`users` không có credential là trạng thái hợp lệ (nhân sự không đăng nhập).

### Sửa user

- Đổi phòng ban hoặc chức vụ thì kiểm tra lại cặp (phòng ban, chức vụ) theo giá trị hiệu lực sau sửa. Chỉ đổi phòng ban mà không kèm chức vụ mới luôn lỗi `E064`, vì chức vụ thuộc đúng một phòng ban.
- Không gửi `credential` thì không đụng bảng `credentials`: user chưa có tài khoản vẫn sửa hồ sơ được.
- Gửi `credential` cho user đã có tài khoản: cập nhật username, email, role, `credentialEnabled`; để trống mật khẩu thì giữ mật khẩu cũ.
- Gửi `credential` cho user chưa có tài khoản là tạo mới, bắt buộc có mật khẩu: `E207` (400).
- Gán role cho user chưa có tài khoản: `E032` (400).

### Gán role

Ba đường ghi role (`POST /users`, `PATCH /users/:userId`, `PATCH /users/:userId/role`) cùng đi qua một hàm kiểm tra theo thứ tự: người thao tác có quyền quản lý role (`E033`) → role tồn tại (`E027`) → người thao tác không tự leo thang qua role đó (`E034`, tức role chứa `system:manage` mà người thao tác không có).

## Phòng ban (`/api/departments`)

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /departments` | đăng nhập | Phân trang, tìm mã/tên không dấu, lọc `isActive`. Kèm `positionCount` và `employeeCount`. |
| `GET /departments/:departmentId` | đăng nhập | Chi tiết kèm hai số đếm. |
| `POST /departments` | `departments:create` | Mã trùng: `E266` (409). |
| `PATCH /departments/:departmentId` | `departments:update` | Đổi mã sang mã đã có: `E266`. |
| `DELETE /departments/:departmentId` | `departments:delete` | Xoá cứng. Còn chức vụ hoặc nhân sự thuộc phòng ban thì `E267` (409). |

Danh sách và chi tiết **không** khai `@Permissions`, dù có mã `departments:read` trong danh mục: mọi người đăng nhập đều xem được. Không tồn tại: `E014` (404).

## Chức vụ (`/api/positions`)

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /positions` | đăng nhập | Phân trang, tìm mã/tên không dấu, lọc theo `departmentId`; kèm phòng ban và `employeeCount`. |
| `POST /positions` | `positions:create` | Phòng ban phải tồn tại (`E014`). Mã trùng: `E268`. Trả 204. |
| `PATCH /positions/:positionId` | `positions:update` | Có thể chuyển sang phòng ban khác. Không tồn tại: `E015`. |
| `DELETE /positions/:positionId` | `positions:delete` | Xoá cứng. Còn nhân sự giữ chức vụ thì `E269` (409). |

Không có `GET /positions/:id`. Danh sách cũng không khai `@Permissions`. Việc chức vụ khớp phòng ban của user chỉ được kiểm trong `UsersService`, không có ràng buộc ở DB, nên chuyển một chức vụ sang phòng ban khác có thể làm lệch với user đang giữ chức vụ đó.

## Bảng mã lỗi của domain

| Mã | HTTP | Ý nghĩa |
|---|---|---|
| E001 | 409 | Username đã tồn tại |
| E002 | 404 | Không tìm thấy credential của người dùng hiện tại |
| E003 | 409 | Email đã tồn tại |
| E004 | 401 | Sai thông tin đăng nhập |
| E012 | 404 | Không tìm thấy user |
| E013 | 409 | CCCD đã tồn tại |
| E014 | 404 | Không tìm thấy phòng ban |
| E015 | 404 | Không tìm thấy chức vụ |
| E018 | 403 | Tài khoản bị tắt hoặc user đã nghỉ việc |
| E027 | 404 | Không tìm thấy role |
| E028 | 409 | Mã role đã tồn tại |
| E029 | 409 | Role đang được gán |
| E030 | 403 | Role hệ thống, chỉ đọc |
| E031 | 400 | Mã quyền không hợp lệ |
| E032 | 400 | User chưa có tài khoản đăng nhập |
| E033 | 403 | Thiếu quyền |
| E034 | 403 | Không được cấp quyền `system:manage` khi bản thân không có |
| E064 | 400 | Chức vụ không thuộc phòng ban đã chọn |
| E207 | 400 | Tạo tài khoản mới bắt buộc có mật khẩu |
| E266 / E267 | 409 | Mã phòng ban trùng / phòng ban còn được dùng |
| E268 / E269 | 409 | Mã chức vụ trùng / chức vụ còn được dùng |

## Role mặc định

Enum `Role` trong `src/constants/role.constant.ts` liệt kê: ADMIN, DIRECTOR, QC, BUSINESS, WAREHOUSE, PRODUCTION_MANAGER, PROCUREMENT_MANAGER. Mã role seed chưa được kiểm trong part này (toàn bộ seed BE đã bị xoá, chỉ còn `supplier-groups.seed.ts`), nên role thật trong từng môi trường lấy từ DB.
