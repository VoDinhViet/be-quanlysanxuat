# Tính năng: Positions (Chức vụ)

## Mục đích

Danh mục chỉ-đọc các chức vụ, mỗi chức vụ thuộc đúng một phòng ban. Là nguồn dữ liệu cho dropdown "Chức vụ" trên form nhân viên — được lọc theo phòng ban đã chọn trước đó, và đó chính là lý do tồn tại của query param `departmentId`.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá. Dữ liệu được seed — `pnpm db:seed:credentials` tạo sẵn các chức vụ mà tài khoản mặc định của nó cần, idempotent theo `code`.
- **Mỗi chức vụ luôn thuộc đúng một phòng ban.** `positions.departmentId` là `notNull` + `onDelete: restrict`: "NV Kinh doanh" chỉ có nghĩa trong "Phòng Kinh doanh", và không xoá được phòng ban khi còn chức vụ trỏ tới.
- **`code` duy nhất trên toàn hệ thống, không phải duy nhất trong từng phòng ban** (`varchar(50)`). Hai phòng ban không thể cùng dùng mã `TRUONG_PHONG` — phải đặt mã khác nhau.
- **`description` có trong bảng nhưng không được expose** ra `PositionResDto`.
- **Cặp phòng ban/chức vụ được kiểm khi ghi, không chỉ lọc ở dropdown.** `UsersService` từ chối `positionId` có `departmentId` không khớp phòng ban hiệu lực của nhân viên, với `E064`. Nên truyền `?departmentId=` ở đây chỉ là chuyện hiển thị — một request viết tay với cặp lệch nhau vẫn sẽ fail. Phép kiểm dùng phòng ban *hiệu lực*: cái được gửi lên trong request, hoặc phòng ban hiện tại của nhân viên khi chỉ một trong hai đang bị đổi.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/positions` | public | `GetPositionsReqDto` — `limit`, `page`, `q`, `order`, `departmentId` | `200` + `PositionResDto` phân trang |

- **`departmentId`** (UUID, tuỳ chọn) là filter duy nhất module này thêm vào so với `PageOptionsDto`. **Bỏ trống thì trả về mọi chức vụ** — luôn truyền nó khi đổ dữ liệu cho dropdown Chức vụ, nếu không danh sách sẽ chào mời cả chức vụ của phòng ban khác, để rồi tầng ghi từ chối bằng `E064`.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`. Nó **không** tìm theo tên phòng ban.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `PositionResDto` là `{ id, code, name, department }`, trong đó `department` là `DepartmentResDto` đầy đủ (`{ id, code, name }`) — lấy qua `with: { department: true }`, nên không cần gọi thêm lần nữa để hiển thị "Trưởng phòng — Phòng Kỹ thuật".
- Có phân trang: đọc bao `{ data, pagination }`.

## Trường hợp lỗi

Không có. `PositionsService` chỉ có một method và không throw `AppException` nào. `departmentId` không tồn tại **không** phải 404 — nó là một filter hợp lệ chẳng khớp gì, nên response là `200` với `data: []`. `E015` (`position.error.not_found`) và `E064` (`position.error.department_mismatch`) được throw bởi `UsersService`, không phải ở đây.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Cấp bậc chức vụ, khung lương, hay tuyến báo cáo.
- Mã duy nhất theo từng phòng ban (mã duy nhất toàn hệ thống là chủ ý).

## Xem thêm

- [`departments.md`](departments.md) — danh mục cha; chọn nó trước.
- `users` — nơi tiêu thụ, và là nơi throw `E015`/`E064`. Chưa có doc; xem `src/api/users/`.
