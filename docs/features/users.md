# Tính năng: Users (Nhân viên & tài khoản đăng nhập)

## Mục đích

Quản lý hồ sơ nhân viên, và tuỳ chọn cấp cho họ một tài khoản đăng nhập ERP kèm vai trò.

Điểm cần nắm trước tiên: **hồ sơ nhân viên và tài khoản đăng nhập là hai bảng khác nhau.**

| Bảng | Chứa gì |
| ---- | ------- |
| `users` | Hồ sơ nhân sự: họ tên, giới tính, CCCD, phòng ban, chức vụ, ngày vào làm, ảnh đại diện |
| `credentials` | Danh tính đăng nhập: username, email, mật khẩu, **và `roleId`** |

Phân quyền neo ở `credentials`: JWT `sub` chính là `credentials.id`, nên tầng permission phân giải quyền thẳng từ token mà không cần đụng tới `users`. Hệ quả trực tiếp: **role không gán được cho một nhân viên chưa có tài khoản đăng nhập** (`E032`).

Một nhân viên có thể không có tài khoản (`users.credentialId` nullable), và ngược lại một tài khoản có thể không gắn nhân viên nào (ví dụ tài khoản quản trị thuần).

## Quy tắc nghiệp vụ

### Mã nhân viên

- **`code` luôn tự sinh**, dạng `NV0001` — đếm tổng số dòng `users` rồi +1, pad 4 chữ số. Client **không gửi được** `code` (không có trường này trên DTO).
- Cùng cơ chế và cùng điểm yếu như `products`: có cửa sổ TOCTOU giữa lúc đếm và lúc insert; chốt chặn thật là ràng buộc `unique` trên cột.

### Phòng ban và chức vụ

- Cả `departmentId` lẫn `positionId` đều **bắt buộc** khi tạo, và `onDelete: restrict` ở tầng DB.
- **Chức vụ phải thuộc đúng phòng ban đó** → lệch thì `E064` (400). Xem [`positions.md`](positions.md).
- Khi `PATCH`, phép kiểm chạy lại nếu **một trong hai** được gửi, đối chiếu với giá trị *hiệu lực* của phía kia (giá trị mới nếu có gửi, không thì lấy giá trị hiện tại của nhân viên).
- **Đổi mỗi `departmentId` mà không đổi `positionId` thì luôn luôn `E064`** — theo thiết kế, vì một chức vụ chỉ thuộc một phòng ban. Form đổi phòng ban bắt buộc phải gửi kèm chức vụ mới.

### CCCD, ảnh đại diện

- `idNumber` là `unique` nếu có gửi → trùng thì `E013` (409). Khi `PATCH`, phép kiểm loại trừ chính dòng đang sửa.
- `avatarFileId` trỏ tới registry `files`, không phải URL trần. Upload trước qua `POST /files?type=USER_AVATAR` rồi gửi id. File được đánh dấu đã liên kết trước khi ghi, để bộ quét file mồ côi không dọn mất.
- Trong response, quan hệ `avatarFile` được đổi tên thành `avatar`. `FileResDto.url` là link ký số **có hạn** — đừng cache, hết hạn thì đọc lại nhân viên để lấy link mới.

### Tài khoản đăng nhập

- `credential` là object lồng, **chỉ có khi tạo** — `PATCH /users/:userId` không sửa được username/email/mật khẩu.
- `username` và `email` của credential đều `unique` → `E001` / `E003` (409).
- Mật khẩu được hash bcrypt (10 salt rounds) trước khi lưu; **không response nào phơi ra password hash**.
- **Credential được insert TRƯỚC dòng `users`, và không nằm trong transaction.** Chủ ý: credential lỗi (trùng username) thì không để lại nhân viên mồ côi. Đánh đổi ngược lại vẫn còn: nếu insert `users` lỗi sau đó, một credential mồ côi ở lại trong DB. Đây là hành vi đã có từ trước, chưa sửa.

### Gán vai trò

Có **ba** đường gán role, **tất cả đi qua cùng một chuỗi kiểm** (`resolveRoleForAssignment` trong `UsersService`), nên không đường nào lệch luật so với đường khác:

| Đường | Khi nào dùng |
| ----- | ------------ |
| `POST /users` với `credential.roleId` | Tạo nhân viên + tài khoản + vai trò trong một lần submit |
| `PATCH /users/:userId` với `roleId` | Sửa hồ sơ và/hoặc đổi vai trò |
| `PATCH /users/:userId/role` | Màn hình phân quyền riêng — chỉ cần `roles:update`, không cần `users:update` |

Bốn quy tắc, áp dụng cho cả ba:

1. **Phải có quyền `roles:update`** (hoặc `system:manage`) → thiếu thì `E033` (403). Với `POST`/`PATCH /users`, guard của route chỉ đòi `users:create`/`users:update`, nên phép kiểm này nằm trong service và **chỉ chạy khi `roleId` thực sự được gửi**. Người chỉ có `users:create` vẫn tạo nhân viên bình thường, chỉ là không kèm role.
2. **Vai trò phải tồn tại** và chưa xoá mềm → `E027` (404).
3. **Chống leo thang đặc quyền**: gán một vai trò có chứa `system:manage` chỉ được phép nếu caller *đã* có `system:manage` → `E034` (403). Không có luật này thì người giữ `roles:update` có thể tự đúc đường lên toàn quyền.
4. **Nhân viên phải có tài khoản đăng nhập** → chưa có thì `E032` (400). Với `POST /users` điều này không thể xảy ra: `roleId` lồng bên trong `credential`, nên "gửi role mà không tạo tài khoản" không biểu diễn được.

Thứ tự kiểm là **`E032` → `E033` → `E027` → `E034`** (với `POST` thì bỏ `E032`). Chỉ lỗi đầu tiên được trả về.

**Cache**: đổi role xong, `PermissionsService.invalidateCredential` được gọi ngay, nên quyền mới có hiệu lực ở request kế tiếp của tài khoản đó thay vì phải đợi hết TTL 5 phút. Riêng `POST /users` không cần — credential vừa tạo chưa từng được phân giải nên chưa có gì trong cache.

**Chưa gỡ được role.** DTO chỉ nhận UUID, không nhận `null`. Muốn thu hồi quyền thì gán sang một vai trò hạn chế hơn.

### Trạng thái

- `status` mặc định `WORKING`, giá trị còn lại là `RESIGNED`.
- **`RESIGNED` không tự khoá tài khoản đăng nhập.** `credentials` không có cờ active/inactive riêng, và luồng đăng nhập là nơi diễn giải `users.status` (`E018`). Đổi `status` không thu hồi token đang có hiệu lực.

### Xoá

- **Không có route xoá.** Bảng `users` *có* cột `deletedAt`, nhưng **hiện không có gì ghi vào nó và không truy vấn nào lọc theo nó** — cột đang nằm không. Đừng cho rằng xoá mềm đã hoạt động ở đây (khác `products` và `roles`, hai bảng thực sự dùng `deletedAt`).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/users/me` | chỉ cần token | — | `200` + `CredentialResDto` |
| GET | `/users` | `users:update` | `GetUsersReqDto` — `limit`, `page`, `q`, `order` | `200` + `UserResDto` phân trang |
| GET | `/users/:userId` | `users:update` | — | `200` + `UserResDto` |
| POST | `/users` | `users:create` (+ `roles:update` nếu gửi `credential.roleId`) | `CreateUserReqDto` — `fullName`*, `gender`*, `departmentId`*, `positionId`*, `hireDate`*, `dateOfBirth`, `idNumber`, `phoneNumber`, `email`, `address`, `avatarFileId`, `note`, `status`, `credential` | `201` + `UserResDto` |
| PATCH | `/users/:userId` | `users:update` (+ `roles:update` nếu gửi `roleId`) | `UpdateUserReqDto` — mọi trường tuỳ chọn, kể cả `roleId` | `200` + `UserResDto` |
| PATCH | `/users/:userId/role` | `roles:update` | `AssignRoleReqDto` — `roleId`* | `200` + `UserResDto` |

(`*` = bắt buộc)

- **`GET /users` và `GET /users/:userId` dùng quyền `users:update`, không phải `users:read`** — catalogue `PERMISSION_CODES` không có mã `users:read`, và `users:delete` cũng không. Trông như lỗi nhưng đây là trạng thái thật; đọc danh sách nhân viên hiện đòi quyền sửa.
- **`GET /users/me` không khai `@Permissions`** — chỉ cần token hợp lệ. Nó trả `CredentialResDto`, **khác `UserResDto`**: xoay quanh danh tính đăng nhập (`username`, `email`, `role`) và kèm `permissions` — mảng mã quyền hiệu lực, dùng để FE bật/tắt UI theo quyền.
- **`q` ở `GET /users` dùng `ilike` thuần, không phải `unaccentILike`** như các module khác — tìm "nguyen" **không** ra "Nguyễn". Khớp `fullName` và `code`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `UserResDto` kèm sẵn `department`, `position`, `avatar`, và `credential` (gồm `credential.role`) — đủ để render bảng nhân viên mà không cần gọi thêm.
- `credential` là `null` khi nhân viên chưa có tài khoản; `credential.role` là `null` khi tài khoản chưa được gán vai trò.
- Sau `POST`/`PATCH`, service đọc lại dòng bằng `getUserDetail(id)` rồi mới map — response luôn là trạng thái đã lưu.
- `POST /users/:userId/avatar` **đã bị gỡ 2026-07-20** (trùng chức năng với `POST /files`). Đặt ảnh đại diện bằng `avatarFileId`.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Không tìm thấy nhân viên | `ErrorCode.E012` | 404 |
| Không tìm thấy credential (`GET /users/me`) | `ErrorCode.E002` | 404 |
| `username` của credential đã tồn tại | `ErrorCode.E001` | 409 |
| `email` của credential đã tồn tại | `ErrorCode.E003` | 409 |
| `idNumber` đã tồn tại ở nhân viên khác | `ErrorCode.E013` | 409 |
| `departmentId` không tồn tại | `ErrorCode.E014` | 404 |
| `positionId` không tồn tại | `ErrorCode.E015` | 404 |
| Chức vụ không thuộc phòng ban hiệu lực | `ErrorCode.E064` | 400 |
| `avatarFileId` không tồn tại | `ErrorCode.E042` | 404 |
| Gán role cho nhân viên chưa có tài khoản | `ErrorCode.E032` | 400 |
| Gán role trong khi thiếu quyền `roles:update` | `ErrorCode.E033` | 403 |
| Vai trò không tồn tại / đã xoá mềm | `ErrorCode.E027` | 404 |
| Gán vai trò có `system:manage` trong khi caller không có | `ErrorCode.E034` | 403 |

`E005` (`user.error.code_exists`) và `E018` (`user.error.resigned`) không được throw trong module này — `E005` hiện không có chỗ nào throw (mã do server sinh), `E018` thuộc luồng đăng nhập.

## Ghi chú tích hợp cho frontend

- **Mới (2026-07-24)**: gán vai trò ngay trong form tạo/sửa nhân viên, không cần gọi thêm request thứ hai.
  - `POST /users` → đặt `roleId` **bên trong** object `credential`:
    ```json
    { "fullName": "...", "credential": { "username": "...", "email": "...", "password": "...", "roleId": "<uuid>" } }
    ```
  - `PATCH /users/:userId` → đặt `roleId` ở **cấp cao nhất** (lúc này tài khoản đã tồn tại nên không có object `credential`).
  - Sự bất đối xứng này là chủ ý: role sống trên credential, nên khi tạo nó đi cùng credential.
- Route cũ `PATCH /users/:userId/role` **vẫn hoạt động y như trước**, không có thay đổi gì. Không bắt buộc phải chuyển sang cách mới.
- Màn hình nào có gửi role phải xử lý thêm **403 `E033`**: người dùng đủ quyền tạo/sửa nhân viên nhưng không đủ quyền gán vai trò. Cách tốt nhất là ẩn/disable ô chọn vai trò khi `GET /users/me` trả `permissions` không chứa `roles:update` lẫn `system:manage`.
- Dropdown vai trò lấy từ `GET /roles` (cần quyền `roles:read`) — xem [`roles.md`](roles.md).

## Ngoài phạm vi

- Xoá nhân viên (cả xoá cứng lẫn xoá mềm).
- Đổi username/email/mật khẩu sau khi tạo, và luồng quên mật khẩu.
- Gỡ vai trò (`roleId: null`).
- Nhiều vai trò trên một tài khoản — `credentials.roleId` là một-một.
- Thu hồi token đang có hiệu lực khi nhân viên chuyển `RESIGNED`.
- Bọc `createUser` trong transaction (credential mồ côi, mô tả ở trên).

## Xem thêm

- [`roles.md`](roles.md) — danh mục vai trò, catalogue quyền, và cùng luật chống leo thang `E034`.
- [`departments.md`](departments.md), [`positions.md`](positions.md) — hai danh mục ràng buộc nhau qua `E064`.
- `auth` — đăng nhập và `E018`. Chưa có doc; xem `src/api/auth/`.
